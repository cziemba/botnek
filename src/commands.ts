import ChatGPT from './commands/chatgpt';
import Emote from './commands/emote';
import { Help } from './commands/help';
import Play from './commands/play';
import ServerEmoji from './commands/serverEmoji';
import Sfx from './commands/sfx';
import Stop from './commands/stop';
import { Command } from './types/command';

const COMMANDS: Command[] = [Sfx, Play, Stop, Help, Emote, ServerEmoji, ChatGPT];

export default COMMANDS;
