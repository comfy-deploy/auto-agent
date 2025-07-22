# Agent API Documentation

## Overview
The agent endpoint provides an AI-powered interface to search and discover FAL AI models using natural language prompts.

## Endpoint
`POST /api/agent`

## Request Format
```json
{
  "prompt": "your search query here"
}
```

## Response Format
```json
{
  "messages": [
    {
      "role": "user",
      "content": "user's prompt"
    },
    {
      "role": "tool",
      "content": "Tool execution details",
      "toolCall": {
        "name": "findFalAPI",
        "parameters": {...},
        "result": {...}
      }
    },
    {
      "role": "assistant",
      "content": "formatted response with model results"
    }
  ],
  "tools": ["findFalAPI"]
}
```

## Example Prompts
- "find image generation models"
- "search for video models" 
- "show me image to video models"
- "find flux models"
- "list kling video models"

## Testing

### Using the Web UI
1. Start the server: `bun dev`
2. Open http://localhost:3000
3. In the API Tester:
   - Select "POST" method
   - Enter `/api/agent` as endpoint
   - Enter JSON body: `{"prompt": "find image generation models"}`
   - Click Send

### Using the Test Script
```bash
bun run test-agent.ts
```

### Using curl
```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"prompt": "find image to video models"}'
```

## Available Tools

### findFalAPI
Searches the FAL AI model database.

Parameters:
- `query`: Search term to find models
- `category`: Filter by category (e.g., "text-to-image", "image-to-video")
- `limit`: Maximum number of results (default: 10)

The tool searches across model titles, descriptions, categories, and tags.