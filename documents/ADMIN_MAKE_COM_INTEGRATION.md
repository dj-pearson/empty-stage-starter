# Make.com Integration for EatPal pSEO Automation

## Endpoint

POST https://functions.tryeatpal.com/process-pseo-queue

## Headers

- Content-Type: application/json
- Authorization: Bearer <SUPABASE_ANON_KEY>

## Payload

```json
{
  "limit": 5,
  "batchId": "<optional batch UUID>",
  "dryRun": false
}
```

| Field     | Type    | Default | Description                                      |
|-----------|---------|---------|--------------------------------------------------|
| `limit`   | number  | 5       | Max items to process per call (1-20)             |
| `batchId` | string  | null    | Process only items from a specific batch         |
| `dryRun`  | boolean | false   | Preview what would be processed without running  |

## What it does

1. Picks the next N items from `pseo_generation_queue` (status: `queued`, ordered by priority)
2. For each item: creates or updates a `pseo_pages` record, generates AI content, scores quality
3. Updates queue status (`completed` or retries on failure, up to 3 attempts)
4. If processing a batch, updates batch counters and marks complete when done

## Response

```json
{
  "status": "processed",
  "processed": 5,
  "succeeded": 4,
  "failed": 1,
  "results": [
    {
      "queueId": "uuid",
      "pageType": "FOOD_CHAINING_GUIDE",
      "slug": "food-chaining/chicken-nuggets",
      "status": "success",
      "pageId": "uuid",
      "qualityScore": 0.85
    }
  ],
  "batchId": null
}
```

## Related Edge Functions

| Function                 | Purpose                                                      |
|--------------------------|--------------------------------------------------------------|
| `process-pseo-queue`     | Queue processor — call this from Make.com on a timer         |
| `generate-pseo-content`  | Single page generator — called internally by the queue processor, or directly from the admin dashboard |

## Example Make.com HTTP Module Setup

- **Method:** POST
- **URL:** https://functions.tryeatpal.com/process-pseo-queue
- **Headers:** Content-Type: application/json, Authorization: Bearer <key>
- **Body:** `{ "limit": 5 }`

## Scheduling

- Run every 10-15 minutes to steadily generate pages
- Each call processes up to `limit` pages (default 5)
- When the queue is empty, the function returns `{ "status": "empty" }` — no cost incurred
- For large batches, increase `limit` up to 20 (be mindful of edge function timeout)
