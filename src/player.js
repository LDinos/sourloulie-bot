
import { joinVoiceChannel, getVoiceConnection, createAudioResource, createAudioPlayer, AudioPlayerStatus } from '@discordjs/voice';
import { join } from 'node:path';
import path from 'path';
import fs from 'fs';
import ytdl from "@distube/ytdl-core";
import { exec } from 'child_process';
import { promisify } from 'util';
import { Song, Queue, Playlist, clearResourceFolder, convertSecondsToTime, replyOrEdit, COMMAND_PREFIX } from './utils.js';
import { time } from 'node:console';
import chalk from 'chalk';
import { EmbedBuilder } from 'discord.js';

const __dirname = import.meta.dirname;
const execAsync = promisify(exec);

const player = createAudioPlayer();
const songQueue = new Queue(player);
let client = null;
let channelId = null;


player.on(AudioPlayerStatus.Playing, () => {
    console.log(chalk.yellow('The audio player has started playing!'));
});

player.on('error', (error) => {
    console.error(`Error: ${error.message}`);
});

player.on(AudioPlayerStatus.Idle, () => {
    console.log(chalk.yellow('The audio player is idle. Playing next song if available...'));
    //const connection = getVoiceConnection(songQueue.connection.guildId);
    setTimeout(() => {
        songQueue.playNext();
        sendQueueMessage();
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

const sendQueueMessage = () => {
    if (!client || songQueue.isEmpty()) return;
    const channel = client.channels.cache.get(channelId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setTitle('Current Queue')
            .setDescription(songQueue.songs.map((s) => ' - ' + s.title + ` (${convertSecondsToTime(s.lengthSeconds)})` ).join('\n - '))
            .setColor('#0099ff');
        channel.send({ embeds: [embed] });
    }
}

const getPlaylistInfo = async (url) => {
    const command = `${COMMAND_PREFIX}yt-dlp --flat-playlist --dump-json "${url}"`;
    try {
        const { stdout, stderr } = await execAsync(command);
        console.log(chalk.gray(`yt-dlp playlist output: ${stdout}`));
        if (stderr) {
            console.error(chalk.red(`yt-dlp stderr: ${stderr}`));
            throw new Error(stderr);
        }
        const buffer = `[${stdout.replaceAll('\n', ',')}`;
        const playlistInfo = JSON.parse(buffer.slice(0, -1) + ']');
        return playlistInfo.map((video) => video.url);
    }
    catch (err) {
        console.error(`Error executing yt-dlp playlist:`, err);
    }
}

const downloadVideo = async (url, connection, interaction) => {
    if (songQueue.isEmpty()) {
        clearResourceFolder(); // Cleanup folder if we start a new queue
    }
    console.log(`Downloading video from URL: ${url}`);
    const freeSlotIndex = songQueue.getFreeSlotIndex();
    const filename = `resource/${freeSlotIndex}.mp3`;
    const command = `${COMMAND_PREFIX}yt-dlp -t mp3 -o "${filename}" --force-overwrites --parse-metadata "title:%(title)s" --embed-metadata ${url}`;
    const newSong = new Song(
        null,
        url,
        freeSlotIndex,
        null,
        null
    );
    songQueue.addSong(connection, newSong);
    try {
        const { stdout, stderr } = await execAsync(command);
        if (stderr) {
            console.log(chalk.yellow(`yt-dlp stderr: ${stderr}`));
            //throw new Error(stderr);
        }
        console.log(chalk.gray(`yt-dlp output: ${stdout}`));
        console.log(chalk.gray(`Download finished`));
        const videoInfo = await ytdl.getBasicInfo(url);
        const videoDetails = videoInfo.videoDetails;
        newSong.title = videoDetails.title;
        newSong.lengthSeconds = videoDetails.lengthSeconds;
        newSong.thumbnailUrl = videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url;
    }
    catch (err) {
        console.error(`Error executing yt-dlp:`, err);
        songQueue.removeSpecificSong(newSong.id);
        await replyOrEdit(interaction, `There was an error downloading the video. Check if the link is correct or if the video is not age restricted.`);
    }
}

export const play = async (interaction) => {
    await replyOrEdit(interaction, songQueue.isEmpty() ? 'Downloading song...' : 'Adding song to queue...');
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
            for(const url of urlsToDownload) {
                await downloadVideo(url, connection, interaction);
            }
            songQueue.setGuildId(member.voice.channel.guild.id);
            sendQueueMessage();
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
    sendQueueMessage();
}