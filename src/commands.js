import { SlashCommandBuilder } from 'discord.js';
import { play, connect, disconnect, shuffleQueue, skipSong, pauseSong, resumeSong, setVolume, getQueue } from './player.js';
export const commands = [
    {
        name: 'play',
        data: new SlashCommandBuilder().setName('play').setDescription('Plays a song')
            .addStringOption((option) =>
                option.setName('url')
                    .setDescription('The URL of the song to play')
                    .setRequired(true)
            ),
        execute: play
    },
    {
        name: 'connect',
        data: new SlashCommandBuilder().setName('connect').setDescription('Connects to a voice channel'),
        execute: connect
    },
    {
        name: 'disconnect',
        data: new SlashCommandBuilder().setName('disconnect').setDescription('Disconnects from the voice channel'),
        execute: disconnect
    },
    {
        name: 'shuffle',
        data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffles the queue'),
        execute: shuffleQueue
    },
    {
        name: 'skip',
        data: new SlashCommandBuilder().setName('skip').setDescription('Skips the current song'),
        execute: skipSong
    },
    {
        name: 'pause',
        data: new SlashCommandBuilder().setName('pause').setDescription('Pauses the current song'),
        execute: pauseSong
    },
    {
        name: 'resume',
        data: new SlashCommandBuilder().setName('resume').setDescription('Resumes the current song'),
        execute: resumeSong
    },
    {
        name: 'queue',
        data: new SlashCommandBuilder().setName('queue').setDescription('Displays the current queue'),
        execute: getQueue
    },
]