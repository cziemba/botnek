import { Command } from './types/command.js';
import Play from './commands/play.js';
import Stop from './commands/stop.js';
import Sfx from './commands/sfx.js';
import { Help } from './commands/help.js';
import Emote from './commands/emote.js';
import ServerEmoji from './commands/serverEmoji.js';
import ChatGPT from './commands/chatgpt.js';

const Commands: Command[] = [
    Sfx,
    Play,
    Stop,
    Help,
    Emote,
    ServerEmoji,
    ChatGPT,
];

export default Commands;
