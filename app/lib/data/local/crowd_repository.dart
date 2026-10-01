import 'package:isar/isar.dart';
import 'package:pegou_preco/core/crowd/trust_engine.dart';
import 'package:pegou_preco/data/local/schemas.dart';

class CrowdRepository {
  CrowdRepository(this._isar);
  final Isar _isar;

  Future<UserReputation> ensureReputation(String userId) async {
    final existing = await _isar.userReputations
        .filter()
        .userIdEqualTo(userId)
        .findFirst();
    if (existing != null) return existing;
    final rep = UserReputation()
      ..userId = userId
      ..points = 0
      ..level = FiscalLevel.bronze
      ..validationsCount = 0
      ..updatedAt = DateTime.now().toUtc();
    await _isar.writeTxn(() => _isar.userReputations.put(rep));
    return rep;
  }

  Future<UserReputation?> getReputation(String userId) => _isar.userReputations
      .filter()
      .userIdEqualTo(userId)
      .findFirst();

  Future<PriceVote?> recentVote({
    required int priceLogId,
    required String voterId,
  }) async {
    final since = DateTime.now().toUtc().subtract(const Duration(hours: 24));
    final votes = await _isar.priceVotes
        .filter()
        .priceLogIdEqualTo(priceLogId)
        .and()
        .voterIdEqualTo(voterId)
        .findAll();
    for (final v in votes) {
      if (v.createdAt.isAfter(since)) return v;
    }
    return null;
  }

  /// Registra voto, atualiza scores do PriceLog e reputação do usuário.
  Future<PriceLog?> castVote({
    required int priceLogId,
    required String voterId,
    required VoteType vote,
    bool withPhoto = false,
  }) async {
    final recent = await recentVote(priceLogId: priceLogId, voterId: voterId);
    if (recent != null) return null;

    final log = await _isar.priceLogs.get(priceLogId);
    if (log == null) return null;

    final rep = await ensureReputation(voterId);
    final weight = TrustEngine.weightFor(rep.level);
    final now = DateTime.now().toUtc();

    final priceVote = PriceVote()
      ..priceLogId = priceLogId
      ..priceLogRemoteId = log.remoteId
      ..voterId = voterId
      ..vote = vote
      ..weight = weight
      ..createdAt = now
      ..synced = false;

    if (vote == VoteType.confirm) {
      log.confirmScore += weight;
      log.lastConfirmedAt = now;
    } else {
      log.rejectScore += weight;
    }
    log.trustLevel = TrustEngine.compute(
      confirmScore: log.confirmScore,
      rejectScore: log.rejectScore,
      lastConfirmedAt: log.lastConfirmedAt,
      now: now,
    );
    log
      ..updatedAt = now
      ..synced = false;

    final pts = TrustEngine.pointsForVote(vote, withPhoto: withPhoto);
    rep
      ..points += pts
      ..validationsCount += 1
      ..level = TrustEngine.levelForPoints(rep.points)
      ..updatedAt = now;

    await _isar.writeTxn(() async {
      await _isar.priceVotes.put(priceVote);
      await _isar.priceLogs.put(log);
      await _isar.userReputations.put(rep);
    });
    return log;
  }

  Future<List<PriceVote>> unsyncedVotes({int limit = 100}) =>
      _isar.priceVotes.filter().syncedEqualTo(false).limit(limit).findAll();

  Future<void> markVoteSynced(int id, String remoteId) async {
    await _isar.writeTxn(() async {
      final v = await _isar.priceVotes.get(id);
      if (v == null) return;
      v
        ..remoteId = remoteId
        ..synced = true;
      await _isar.priceVotes.put(v);
    });
  }

  Future<PriceLog?> latestVisibleForProductMarket({
    required int productId,
    required int marketId,
  }) async {
    final logs = await _isar.priceLogs
        .filter()
        .productIdEqualTo(productId)
        .sortByCapturedAtDesc()
        .findAll();
    for (final log in logs) {
      if (log.marketId == marketId && log.trustLevel != TrustLevel.hidden) {
        return log;
      }
    }
    return null;
  }
}
