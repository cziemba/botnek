import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Message } from 'discord.js';
import { ChatGPTAPI, ChatGPTConversation } from 'chatgpt';
import { BotShim, Command } from '../types/command.js';
import log from '../logging/logging.js';

const ONE_MINUTE_MS = 60 * 1000;

let chatGptApi: ChatGPTAPI;
let currentToken: string;
let conversation: {
    api: ChatGPTConversation,
    expiry: number,
};
async function chatGpt(client: BotShim, interaction: CommandInteraction<'cached'> | Message<true>, msg: string): Promise<void> {
    if (!chatGptApi) {
        [currentToken] = client.config.chatGptTokens || [''];
        chatGptApi = new ChatGPTAPI({
            clearanceToken: 'TODO',
            sessionToken: currentToken,
            markdown: true,
        });
        log.debug(await chatGptApi.ensureAuth());
    }

    if (!conversation || conversation.expiry <= Date.now()) {
        conversation = {
            api: chatGptApi.getConversation(),
            expiry: Date.now() + (5 * 60 * 1000),
        };
    }

    if (interaction instanceof CommandInteraction) {
        await interaction.deferReply();
    }

    try {
        const response = await conversation.api.sendMessage(msg, {
            timeoutMs: ONE_MINUTE_MS,
        });

        await interaction.reply({
            content: `ChatGPT says: ${response}`,
        });

        conversation.expiry = Date.now() + (5 * 60 * 1000);
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
        .addStringOption((text) => text.setName('text')
            .setRequired(true)
            .setDescription('Text to send to chat gpt')),
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
