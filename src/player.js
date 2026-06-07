
import { joinVoiceChannel, getVoiceConnection, createAudioResource, createAudioPlayer, AudioPlayerStatus } from '@discordjs/voice';
import { join } from 'node:path';
import path from 'path';
import fs from 'fs';
import ytdl from "@distube/ytdl-core";
import { 
    Song, Queue, Playlist, clearResourceFolder, clearResourceFile, convertSecondsToTime, replyOrEdit, 
    downloadVideo, getPlaylistInfo, sendCurrentSongMessage, sendQueueMessage, COMMAND_PREFIX 
} from './utils.js';
import { time } from 'node:console';
import chalk from 'chalk';
import { EmbedBuilder } from 'discord.js';


const player = createAudioPlayer();
const songQueue = new Queue(player);
let client = null;
let channelId = null;


player.on(AudioPlayerStatus.Playing, () => {
    console.log(chalk.yellow('The audio player has started playing!'));
    sendCurrentSongMessage(client, channelId, songQueue);
});

player.on('error', (error) => {
    console.error(`Error: ${error.message}`);
});

player.on(AudioPlayerStatus.Idle, () => {
    console.log(chalk.yellow('The audio player is idle. Playing next song if available...'));
    setTimeout(() => {
        songQueue.playNext();
    }, 1000);
});

const connectVoiceChannel = async (interaction) => {
    // Get the member from the interaction and join the voice channel they are in
    const member = interaction.member;
    if (member.voice.channel) {
        const connection = joinVoiceChannel({
            channelId: member.voice.channel.id,
            guildId: member.voice.channel.guild.id,
            adapterCreator: member.voice.channel.guild.voiceAdapterCreator,
        });
    }
    else {
        await replyOrEdit(interaction, 'You need to be in a voice channel to use this command!');
    }
}

export const connect = async (interaction) => {
    // Delete all files inside the resource folder
    try {
        await clearResourceFolder();
    }
    catch (err) {
        console.error(`Error clearing resource folder:`, err);
    }
    await replyOrEdit(interaction, 'Connecting to voice channel...');
    await connectVoiceChannel(interaction);
}

export const disconnect = async (interaction) => {
    await replyOrEdit(interaction, 'Disconnecting from voice channel...');
    // Get the member from the interaction and leave the voice channel they are in
    const member = interaction.member;
    if (member.voice.channel) {
        const connection = getVoiceConnection(member.voice.channel.guild.id);
        if (connection) {
            connection.destroy();
            songQueue.destroyConnection();
        }
        else {
            await replyOrEdit(interaction, 'I am not connected to a voice channel!');
        }
    }
    else {
        await replyOrEdit(interaction, 'You are not in a voice channel!');
    }
}

export const play = async (interaction) => {
    await replyOrEdit(interaction, 'Downloading and adding song(s) to queue...');
    await connectVoiceChannel(interaction);
    const member = interaction.member;
    const optionValue = interaction.options.getString('url').split(' ')[0];
    client = interaction.client;
    channelId = interaction.channelId;
    if (!optionValue.startsWith('http') && !optionValue.startsWith('www')) {
        await replyOrEdit(interaction, 'Please provide a valid youtube URL!');
        return;
    }
    const isPlaylist = optionValue.includes('?list=') || optionValue.includes('&list=');
    const urlsToDownload = isPlaylist ? await getPlaylistInfo(optionValue) : [optionValue];
    if (member.voice.channel) {
        const connection = getVoiceConnection(member.voice.channel.guild.id);
        if (connection) {
            let downloaded = 1;
            for(const url of urlsToDownload) {
                await replyOrEdit(interaction, `Downloading song ${downloaded} of ${urlsToDownload.length}...`);
                await downloadVideo(url, songQueue, connection, interaction);
                downloaded++;
            }
            songQueue.setGuildId(member.voice.channel.guild.id);
            await replyOrEdit(interaction, `Downloaded ${urlsToDownload.length} song${urlsToDownload.length > 1 ? 's' : ''}!`);
            sendQueueMessage(client, channelId, songQueue);
        }
        else {
            await replyOrEdit(interaction, 'I am not connected to a voice channel!');
        }
    }
    else {
        await replyOrEdit(interaction, 'You are not in a voice channel!');
    }
}

export const shuffleQueue = async (interaction) => {
    songQueue.shuffle();
    await replyOrEdit(interaction, 'Shuffled the queue!');
}

export const clearQueue = async (interaction) => {
    songQueue.clear();
    await replyOrEdit(interaction, 'Cleared the queue!');
}

export const skipSong = async (interaction) => {
    player.stop();
    songQueue.player.stop();
    console.log(chalk.yellow('Skipped the current song!'));
    await replyOrEdit(interaction, 'Skipped the current song!');
}

export const pauseSong = async (interaction) => {
    player.pause();
    console.log(chalk.yellow('Paused the current song!'));
    await replyOrEdit(interaction, 'Paused the current song!');
}

export const resumeSong = async (interaction) => {
    player.unpause();
    console.log(chalk.yellow('Resumed the current song!'));
    await replyOrEdit(interaction, 'Resumed the current song!');
}

export const setVolume = async (interaction) => {
    // TODO: implement volume control
    const volume = interaction.options.getInteger('volume');
   // player.setVolume(volume);
    await replyOrEdit(interaction, `Volume set to ${volume}`);
}

export const getQueue = async (interaction) => {
    if (songQueue.isEmpty()) {
        await replyOrEdit(interaction, 'The queue is currently empty!');
        return;
    }
    await replyOrEdit(interaction, `Queue sent to the channel!`);
    sendQueueMessage(client, interaction.channelId, songQueue);
}

export const getCurrentSong = async (interaction) => {
    if (songQueue.isEmpty()) {
        await replyOrEdit(interaction, 'The queue is currently empty!');
        return;
    }
    await replyOrEdit(interaction, 'Current song sent to the channel!');
    sendCurrentSongMessage(client, interaction.channelId, songQueue);
}