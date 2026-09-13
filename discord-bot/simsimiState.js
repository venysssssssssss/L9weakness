// Contexto temporário: desligar o modo descarta a sessão inteira.
const activeChannels = new Map();

module.exports = {
    add: (channelId) => {
        if (!activeChannels.has(channelId)) activeChannels.set(channelId, {
            history: [], pending: null, revision: 0, pausedUntil: 0,
            lastAttempt: -Infinity, lastReply: -Infinity, lastUser: null,
        });
    },
    remove: (channelId) => activeChannels.delete(channelId),
    has: (channelId) => activeChannels.has(channelId),
    get: (channelId) => activeChannels.get(channelId),
};
