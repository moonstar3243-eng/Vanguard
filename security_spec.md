# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Room Code Integrity**: Every document under `/rooms/{roomCode}` must match `^[A-Z0-9]{5}$` and equal `data.code`.
2. **Verified Identity**: All writes (`create`, `update`, `delete`) require an authenticated Google user with `request.auth.token.email_verified == true`.
3. **Seat Bounds & Ownership**: A room holds 1 to 4 players (`seatUids.size() >= 1 && seatUids.size() <= 4` and `seats.size() == seatUids.size()`). No PII (email, phone, address) is stored in `/rooms`.
4. **Action-Scoped Room Updates**:
   - Joining is only allowed while `status == 'WAITING'`, `seatUids.size() < 4`, and the caller is not already in `seatUids`.
   - Settings (`gameVariant`, `scenarioId`, `difficulty`) and launching (`status: 'STARTED'`) are restricted to `hostUid` while `status == 'WAITING'`.
   - Launching atomically requires `existsAfter(.../game/meta)` and `existsAfter(.../game/regions)` and `existsAfter(.../game/nations)`.
   - During `'STARTED'`, only `activeUid` can update turn ownership (`activeUid`, `activeSeatId`, `status`, `updatedAt`).
5. **Terminal State Locking**: Once `status == 'FINISHED'`, no further updates to the room or its `/game/*` subcollection are permitted.
6. **Master Gate on `/rooms/{roomCode}/game/{docId}`**:
   - Reads require `request.auth.uid in get(.../rooms/{roomCode}).data.seatUids`.
   - Writes during gameplay require `room.status == 'STARTED'` and `request.auth.uid == room.activeUid` with `updatedByUid == request.auth.uid` and `updatedAt == request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads
All 12 payloads below must be rejected with `PERMISSION_DENIED`:
1. **Unauthenticated Create**: Create `/rooms/ABC12` without `request.auth`.
2. **Unverified Email Create**: Create `/rooms/ABC12` with `email_verified: false`.
3. **Identity Spoofing on Create**: Create `/rooms/ABC12` where `hostUid != request.auth.uid`.
4. **Ghost Field / Shadow Update**: Update `/rooms/ABC12` including an unknown key `isAdmin: true`.
5. **Path ID Poisoning**: Create `/rooms/INVALID_1500_CHAR_ID...` not matching `^[A-Z0-9]{5}$`.
6. **Timestamp Forgery**: Create or update `/rooms/ABC12` with a client-forged `updatedAt` != `request.time`.
7. **Capacity Overflow**: Join `/rooms/ABC12` when `seatUids.size() == 4`.
8. **Out-of-Turn Hijack**: Non-active player attempts to write `/rooms/ABC12/game/meta`.
9. **Non-Host Launch**: Joined Player 2 attempts to update `status` to `'STARTED'`.
10. **Orphan Start Without Game Docs**: Host sets `status: 'STARTED'` without creating `/game/meta`, `/game/regions`, `/game/nations` in the batch.
11. **Terminal State Tampering**: Active player attempts to mutate `/rooms/ABC12/game/meta` after `status == 'FINISHED'`.
12. **Blanket Room Scraping (`list`)**: Signed-in user attempts to list `/rooms` without filtering to `seatUids` containing their UID.
