# Botnek Configuration

The `BotnekConfig` interface is used to define the configuration options for the `Botnek` Discord bot. It includes the following properties:

- `token` (required): A string representing the Discord bot token. This is necessary for the bot to authenticate and connect to the Discord API.
- `dataRoot` (required): A string representing the root directory path where guild-specific data will be stored. This is where the bot will save any persistent data or settings specific to each guild.
- `chatGptTokens` (optional): An array of strings representing tokens for authentication with the ChatGPT API. This is used if the bot needs to interact with the ChatGPT API for any natural language processing tasks.

## Configuration Example

To use `Botnek` with your own configuration, create a JSON file that follows the structure of the `BotnekConfig` interface, and provide the necessary values for each property. For example:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "dataRoot": "/path/to/data",
  "chatGptTokens": [
    "CHATGPT_API_TOKEN_1",
    "CHATGPT_API_TOKEN_2"
  ]
}
```

Make sure to replace `YOUR_DISCORD_BOT_TOKEN` with your actual Discord bot token, `/path/to/data/directory` with the path to the root directory where you want to store guild-specific data, and `CHATGPT_API_TOKEN_1`, `CHATGPT_API_TOKEN_2`, etc. with your actual ChatGPT API tokens, if applicable.
