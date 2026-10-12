-- Old counters overlapped: subtract the next entry's counters to recover intervals.
CREATE TABLE activity_intervals AS
WITH entries AS (
 SELECT 'finds' AS kind,id,stone_id,occurred_at AS date,views,qr_views FROM finds
 UNION ALL SELECT 'comments',id,stone_id,created_at,views,qr_views FROM comments WHERE find_id IS NULL
)
SELECT kind,id,
 MAX(0,views-COALESCE(LEAD(views) OVER (PARTITION BY stone_id ORDER BY date,id,kind),0)) AS views,
 MAX(0,qr_views-COALESCE(LEAD(qr_views) OVER (PARTITION BY stone_id ORDER BY date,id,kind),0)) AS qr_views
FROM entries;
UPDATE finds SET views=(SELECT views FROM activity_intervals WHERE kind='finds' AND id=finds.id),
 qr_views=MIN((SELECT views FROM activity_intervals WHERE kind='finds' AND id=finds.id),(SELECT qr_views FROM activity_intervals WHERE kind='finds' AND id=finds.id));
UPDATE comments SET views=(SELECT views FROM activity_intervals WHERE kind='comments' AND id=comments.id),
 qr_views=MIN((SELECT views FROM activity_intervals WHERE kind='comments' AND id=comments.id),(SELECT qr_views FROM activity_intervals WHERE kind='comments' AND id=comments.id)) WHERE find_id IS NULL;
DROP TABLE activity_intervals;
