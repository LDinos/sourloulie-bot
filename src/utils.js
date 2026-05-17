
import { VoiceConnection, createAudioResource, AudioPlayer } from "@discordjs/voice";
import fs from 'fs';
import { connect } from "http2";
import chalk from 'chalk';
import os from 'node:os';

export const COMMAND_PREFIX = os.type().includes('Windows') ? '.\\' : '';

/**
 * Represents a song in the queue.
 * @property {string} title - The title of the song.
 * @property {string} url - The URL of the song.
 * @property {number} id - The ID of the song, used for file naming.
 * @property {number} lengthSeconds - The length of the song in seconds.
 * @property {string} thumbnailUrl - The URL of the song's thumbnail image.
 */
export class Song {
    constructor(title, url, id, lengthSeconds, thumbnailUrl) {
        this.title = title;
        this.url = url;
        this.id = id;
        this.lengthSeconds = lengthSeconds;
        this.thumbnailUrl = thumbnailUrl;
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
 * @property {VoiceConnection} connection - The voice connection associated with the queue.
 * @property {string} guildId - The ID of the guild associated with the queue.
 * @property {AudioPlayer} player - The audio player used to play the songs in the queue.
 */
export class Queue {
    songs = [];
    connection = null;
    guildId = null;
    player = null;

    constructor(player) {
        this.player = player;
    }

    getFreeSlotIndex() {
        let i = 0;
        while (fs.existsSync(`resource/${i}.mp3`)) {
            i++;
        }
        console.log(chalk.yellow(`Free slot index: ${i}`));
        return i;
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

    setGuildId(guildId) {
        this.guildId = guildId;
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

    removeSong() {
        this.songs.shift();
    }

    getCurrentSong() {
        return this.songs[0];
    }

    getQueue() {
        return this.songs;
    }

    isEmpty() {
        return this.songs.length === 0;
    }

    playNext() {
        this.removeSong();
        if (this.isEmpty()) {
            return;
        }
        const song = this.getCurrentSong();
        console.log(chalk.yellow(`Playing next song: resource/${song.id}.mp3`));
        const resource = createAudioResource(`resource/${song.id}.mp3`);
        //const connection = getVoiceConnection(this.guildId);
        //connection.subscribe(player);
        this.player.play(resource);
    }
}

export const clearResourceFolder = () => {
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

export const clearResourceFile = (id) => {
    fs.rmSync(`resource/${id}.mp3`, { force: true });
}

export const convertSecondsToTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
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
