import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatGPTAPI } from 'chatgpt';
import { CommandInteraction, Message } from 'discord.js';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';

const ONE_MINUTE_MS = 60 * 1000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;

let api: ChatGPTAPI;
let currentToken: string;
let conversation: {
    id?: string;
    expiry: number;
};
async function chatGpt(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    msg: string,
): Promise<void> {
    if (!api) {
        currentToken = (client.config.chatGptTokens && client.config.chatGptTokens[0]) || '';
        api = new ChatGPTAPI({
            apiKey: currentToken,
        });
    }

    // Initialize conversation
    if (!conversation || conversation.expiry <= Date.now()) {
        conversation = {
            expiry: Date.now() + 5 * 60 * 1000,
        };
    }

    if (interaction instanceof CommandInteraction) {
        await interaction.deferReply();
    }

    try {
        if (conversation.id) {
            log.info(`Continuation of conversation: ${conversation.id}`);
        }
        const response = await api.sendMessage(msg, {
            timeoutMs: ONE_MINUTE_MS,
            ...(conversation.id && { parentMessageId: conversation.id }),
        });

        await interaction.reply({
            content: `ChatGPT says: ${response.text}`,
        });

        conversation.expiry = Date.now() + FIVE_MINUTES_MS;
        conversation.id = response.id;
    } catch (e) {
        await interaction.reply({
            content: `Something went wrong: ${JSON.stringify(e)}`,
        });
        conversation.expiry = Date.now();
    }
}

const ChatGPT: Command = {
    requireUserInChannel: false,
    data: new SlashCommandBuilder()
        .setName('gpt')
        .setDescription('Talk with ChatGPT')
        .addStringOption((text) =>
            text.setName('text').setRequired(true).setDescription('Text to send to chat gpt'),
        ),
    helpText: `
        Chat with https://chat.openai.com/chat
        Usage:
            \`gpt <message>\`
        Example:
            \`gpt hello there\`
    `,
    executeCommand: async (client, interaction) => {
        await chatGpt(client, interaction, interaction.options.getString('text', true));
    },
    executeMessage: async (client, message, args) => {
        await chatGpt(client, message, args.join(' '));
    },
};

export default ChatGPT;
