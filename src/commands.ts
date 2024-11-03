import ChatGPT from './commands/chatgpt.ts';
import Emote from './commands/emote.ts';
import { Help } from './commands/help.ts';
import Play from './commands/play.ts';
import ServerEmoji from './commands/serverEmoji.ts';
import Sfx from './commands/sfx.ts';
import Stop from './commands/stop.ts';
import { Command } from './types/command.ts';

const COMMANDS: Command[] = [Sfx, Play, Stop, Help, Emote, ServerEmoji, ChatGPT];

export default COMMANDS;
