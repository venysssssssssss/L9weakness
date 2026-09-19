// Sessões por canal. init(storage) torna canais ativos e histórico persistentes (sobrevivem restart).
const activeChannels = new Map();
let storage = null;
const fresh = (history = []) => ({
    history, pending: null, revision: 0, pausedUntil: 0,
    lastAttempt: -Infinity, lastReply: -Infinity, lastUser: null,
});

module.exports = {
    init: (s) => {
        storage = s;
        for (const id of s.activeChannels()) activeChannels.set(id, fresh(s.recentMessages(id)));
        return activeChannels.size;
    },
    storage: () => storage,
    add: (channelId) => {
        if (activeChannels.has(channelId)) return;
        activeChannels.set(channelId, fresh(storage ? storage.recentMessages(channelId) : []));
        if (storage) storage.setActive(channelId, true);
    },
    remove: (channelId) => {
        activeChannels.delete(channelId);
        if (storage) storage.setActive(channelId, false);
    },
    has: (channelId) => activeChannels.has(channelId),
    get: (channelId) => activeChannels.get(channelId),
};
