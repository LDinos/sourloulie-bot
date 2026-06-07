
import { VoiceConnection, createAudioResource, AudioPlayer } from "@discordjs/voice";
import fs from 'fs';
import { connect } from "http2";
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import os from 'node:os';
import ytdl from "@distube/ytdl-core";
import { EmbedBuilder } from 'discord.js';

const __dirname = import.meta.dirname;
const execAsync = promisify(exec);

const QUEUE_LINES_LIMIT = 15;
export const COMMAND_PREFIX = os.type().includes('Windows') ? '.\\' : '';

/**
 * Represents a song in the queue.
 * @property {string} title - The title of the song.
 * @property {string} url - The URL of the song.
 * @property {number} id - The ID of the song, used for file naming. Should be the same as videoId, but with a number at the end if there are multiple songs with the same videoId
 * @property {number} lengthSeconds - The length of the song in seconds.
 * @property {string} thumbnailUrl - The URL of the song's thumbnail image.
 * @property {string} videoId - The youtube ID of the video associated with the song.
 */
export class Song {
    constructor(title, url, id, lengthSeconds, thumbnailUrl, videoId) {
        this.title = title;
        this.url = url;
        this.id = id;
        this.lengthSeconds = lengthSeconds;
        this.thumbnailUrl = thumbnailUrl;
        this.videoId = videoId;
    }
}

/**
 * Represents a playlist of songs.
 * @property {Song[]} songs - The list of songs in the playlist.
 */
export class Playlist {
    constructor(songs) {
        this.songs = songs;
    }
}

/**
 * Represents a queue of songs.
 * @property {Song[]} songs - The list of songs in the queue.
 * @property {Song[]} downloadingSongs - The list of songs currently being downloaded.
 * @property {VoiceConnection} connection - The voice connection associated with the queue.
 * @property {string} guildId - The ID of the guild associated with the queue.
 * @property {AudioPlayer} player - The audio player used to play the songs in the queue.
 */
export class Queue {
    songs = [];
    downloadingSongs = [];
    connection = null;
    guildId = null;
    player = null;

    constructor(player) {
        this.player = player;
    }

    shuffle() {
        if (this.songs.length < 2) {
            return;
        }
        // Shuffle the songs from the second place and on, since the first song is currently playing
        const songsToShuffle = this.songs.slice(1);
        for (let i = songsToShuffle.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [songsToShuffle[i], songsToShuffle[j]] = [songsToShuffle[j], songsToShuffle[i]];
        }
        // Replace the songs in the queue with the shuffled ones
        this.songs = [this.songs[0], ...songsToShuffle];
    }

    clear() {
        // Clear everything except the first song if it's currently playing, since if we clear the first song while it's playing, it will cause an error when trying to play the next song since the file will be deleted before it can be played.
        if (this.isEmpty()) return;
        this.songs.slice(1).forEach(song => {
            clearResourceFile(song.id);
        });
        this.songs = [this.songs[0]];
    }

    setGuildId(guildId) {
        this.guildId = guildId;
    }

    addDownloadingSong(song) {
        this.downloadingSongs.push(song);
    }

    addSong(connection, song) {
        const isFirstSong = this.isEmpty();
        this.songs.push(song);
        if (!this.connection) {
            this.connection = connection;
            connection.subscribe(this.player);
            connection.on('stateChange', (oldState, newState) => {
                if (newState.status === 'disconnected') {
                    console.log(chalk.yellow('Voice connection disconnected, destroying connection and clearing queue.'));
                    this.songs = [];
                    this.destroyConnection();
                }
                else if (newState.status === 'ready') {
                    console.log(chalk.yellow('Voice connection is ready.'));
                }
            });
        }
        if (isFirstSong) {
            console.log(chalk.yellow(`Playing first song: resource/${song.id}.mp3`));
            const resource = createAudioResource(`resource/${song.id}.mp3`);
            this.player.play(resource);
        }
    }

    destroyConnection() {
        try {
            this.connection.destroy();
        }
        catch (err) {}
        this.connection = null;
    }

    getFreeSlotIndex(videoId) {
        // Read the filenames using the id found. If the id is found, add a number next to it until we dont find a file with that name. This is to prevent overwriting files when multiple songs with the same id are added to the queue.
        let index = 0;
        let finalId = videoId;
        while (fs.existsSync(`resource/${videoId}${index === 0 ? '' : `_${index}`}.mp3`)) {
            index++;
            finalId = `${videoId}_${index}`;
        }
        return finalId;
    }

    removeSong() {
        const song = this.getCurrentSong();
        //if (!this.songs.length > 0) {
        console.log(chalk.yellow(`Finished playing: ${song.title}`));
        clearResourceFile(song.id);
        //}
        this.songs.shift();     
    }

    removeDownloadingSong(id) {
        this.downloadingSongs = this.downloadingSongs.filter(song => song.id !== id);
    }

    getCurrentSong() {
        return this.songs[0];
    }

    getQueue() {
        return this.songs;
    }

    getDownloadingQueue() {
        return this.downloadingSongs;
    }

    isEmpty() {
        return this.songs.length === 0;
    }

    downloadingQueueIsEmpty() {
        return this.downloadingSongs.length === 0;
    }

    playNext() {
        this.removeSong();
        if (this.isEmpty()) {
            return;
        }
        const song = this.getCurrentSong();
        console.log(chalk.yellow(`Playing next song: resource/${song.id}.mp3`));
        const resource = createAudioResource(`resource/${song.id}.mp3`);
        this.player.play(resource);
    }
    
    songExists(id) {
        return this.songs.length > 0 && this.songs.some(song => song.id === id);
    }

    downloadingSongExists(id) {
        return this.downloadingSongs.length > 0 && this.downloadingSongs.some(song => song.videoId === id);
    }
}


export const sendQueueMessage = (client, channelId, songQueue) => {
    if (!client || songQueue.isEmpty()) return;
    const channel = client.channels.cache.get(channelId);
    if (channel) {
        // If the queue is longer than QUEUE_LINES_LIMIT, only show the first QUEUE_LINES_LIMIT songs and add a line at the end saying how many more songs are in the queue
        const queueSongsLength = songQueue.songs.length;
        const description = songQueue.songs.slice(0, QUEUE_LINES_LIMIT).map((s, index) => `- ${s.title} (${convertSecondsToTime(s.lengthSeconds)}) ${index === 0 ? '\n_____________________\n' : ''}`).join('\n');
        const remainingSongs = queueSongsLength - QUEUE_LINES_LIMIT;
        const embedDescription = description + (remainingSongs > 0 ? `\n...and ${remainingSongs} more` : '');
        const embed = new EmbedBuilder()
            .setTitle('Current Queue')
            .setDescription(embedDescription)
            .setColor('#0099ff');
        channel.send({ embeds: [embed] });
    }
}

export const sendCurrentSongMessage = (client, channelId, songQueue) => {
    if (!client || songQueue.isEmpty()) return;
    const channel = client.channels.cache.get(channelId);
    if (channel) {
        // Add song title, length, thumbnail and url of video in an embed and send it to the channel
        const song = songQueue.getCurrentSong();
        const embed = new EmbedBuilder()
            .setTitle('Now Playing')
            .setDescription(`${song.title} (${convertSecondsToTime(song.lengthSeconds)})\n${song.url}`)
            .setThumbnail(song.thumbnailUrl)
            .setColor('#0099ff');
        channel.send({ embeds: [embed] });
    }
}

export const clearResourceFolder = () => {
    try {
        fs.readdir('resource', (err, files) => {
            if (err) {
                console.error(`Error reading resource directory: `, err);
                return;
            }
            if (files.length === 0) {
                console.log('No files to delete in resource directory.');
                return;
            }
            files.forEach((file) => {
                fs.rmSync(`resource/${file}`, { force: true });
            });
        });
    }
    catch (err) {
        console.error(`Error clearing resource folder:`, err);
    }
}

export const clearResourceFile = (id) => {
    try {
        console.log(chalk.yellow(`Deleting resource/${id}.mp3`));
        fs.rmSync(`resource/${id}.mp3`, { force: true });
    }
    catch (err) {
        console.error(`Error deleting resource file:`, err);
    }
}

export const getPlaylistInfo = async (url) => {
    const command = `${COMMAND_PREFIX}yt-dlp --flat-playlist --dump-json "${url}"`;
    try {
        const { stdout, stderr } = await execAsync(command);
        console.log(chalk.gray(`yt-dlp playlist output: ${stdout}`));
        if (stderr && !stderr.includes('WARNING')) {
            console.yellow(chalk.red(`yt-dlp stderr: ${stderr}`));
            throw new Error(stderr);
        }
        const buffer = `[${stdout.replaceAll('\n', ',')}`;
        const playlistInfo = JSON.parse(buffer.slice(0, -1) + ']');
        return playlistInfo.map((video) => video.url);
    }
    catch (err) {
        console.error(`Error executing yt-dlp playlist:`, err);
        return [];
    }
}

export const downloadVideo = async (url, songQueue, connection, interaction) => {
    console.log(`Downloading video from URL: ${url}`);
    const newSong = new Song(
        null,
        url,
        null,
        null,
        null
    );
    try {
        const videoInfo = await ytdl.getBasicInfo(url);
        const videoDetails = videoInfo.videoDetails;
        console.log(chalk.gray(`Video details: ${videoDetails.title}, length: ${videoDetails.lengthSeconds} seconds`));
        const freeSlotIndex = songQueue.getFreeSlotIndex(videoDetails.videoId);
        if (!songQueue.downloadingQueueIsEmpty()) {
            if (songQueue.downloadingSongExists(videoDetails.videoId)) {
                await replyOrEdit(interaction, `The video you are trying to download is already in the queue.`);
                return;
            }
        }
        if (songQueue.isEmpty()) {
            await clearResourceFolder();
        }
        newSong.title = videoDetails.title;
        newSong.url = url;
        newSong.videoId = videoDetails.videoId;
        newSong.id = freeSlotIndex;
        newSong.lengthSeconds = videoDetails.lengthSeconds;
        newSong.thumbnailUrl = videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url;
        songQueue.addDownloadingSong(newSong);
        const filename = `resource/${freeSlotIndex}.mp3`;
        const command = `${COMMAND_PREFIX}yt-dlp -t mp3 -o "${filename}" --force-overwrites --parse-metadata "title:%(title)s" --embed-metadata ${url}`;
        const { stdout, stderr } = await execAsync(command);
        if (stderr && !stderr.includes('WARNING')) {
            console.log(chalk.yellow(`yt-dlp stderr: ${stderr}`));
            songQueue.removeDownloadingSong(newSong.id);
            //throw new Error(stderr);
        }
        console.log(chalk.gray(`yt-dlp output: ${stdout}`));
        console.log(chalk.gray(`Download finished`));
        songQueue.removeDownloadingSong(newSong.id);
        songQueue.addSong(connection, newSong); // Add song (and play it if it's the first)
    }
    catch (err) {
        console.error(`Error executing yt-dlp:`, err);
        songQueue.removeDownloadingSong(newSong.id);
        await replyOrEdit(interaction, `There was an error downloading the video '${newSong.title ?? url}'. Check if the link is correct or if the video is not age restricted.`);
    }
}

export const replyOrEdit = async (interaction, content, options = {}) => {
    const payload = typeof content === 'string' ? { content, ...options } : content;
    try {
        if (interaction.replied || interaction.deferred) {
            return interaction.editReply(payload);
        }
        return interaction.reply(payload);
    }
    catch (err) {
        console.error('replyOrEdit failed:', err);
        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply(payload).catch(console.error);
        }
        return interaction.followUp ? interaction.followUp(payload).catch(console.error) : undefined;
    }
}

export const convertSecondsToTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}
