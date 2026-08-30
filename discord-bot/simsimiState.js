// Armazena os IDs dos canais onde o SimSimi está ativo
const activeChannels = new Set();

module.exports = {
    add: (channelId) => activeChannels.add(channelId),
    remove: (channelId) => activeChannels.delete(channelId),
    has: (channelId) => activeChannels.has(channelId)
};
