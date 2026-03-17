# Make.com Integration for EatPal pSEO Automation

## Endpoint

POST https://eatpal.com/api/pseo/next

## Payload

```
{}
```

- Optionally, you can send `{ "batchId": "<batch_id>" }` to process a specific batch.

## What it does
- Triggers the next pSEO page build step (processes the next item in the generation queue, or a specific batch if provided).
- Returns JSON with build result or error.

## Example Make.com HTTP Module Setup
- **Method:** POST
- **URL:** https://eatpal.com/api/pseo/next
- **Headers:** Content-Type: application/json
- **Body:** `{}`

## Response
```
{
  "success": true,
  "result": { ...buildResult }
}
```

## Notes
- You can schedule this endpoint to run on a timer, or trigger it after other Make.com steps.
- For advanced control, extend the payload to support more actions (pause, resume, etc).
