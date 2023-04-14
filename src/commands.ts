import { Command } from './types/command.ts';
import Play from './commands/play.ts';
import Stop from './commands/stop.ts';
import Sfx from './commands/sfx.ts';
import { Help } from './commands/help.ts';
import Emote from './commands/emote.ts';
import ServerEmoji from './commands/serverEmoji.ts';
import ChatGPT from './commands/chatgpt.ts';

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
