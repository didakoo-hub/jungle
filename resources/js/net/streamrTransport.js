import { StreamrClient } from "@streamr/sdk";
import { P_CHANNELS, STREAMR_NETWORK } from "./constants.js";

export function createClient(key, { network = STREAMR_NETWORK } = {}) {
    return new StreamrClient({
        environment: network,
        auth: { privateKey: key.privateKey },
        network: { controlLayer: { websocketPortRange: null } },
    });
}

export function transportStreamr(client, { streamId = P_CHANNELS[0].streamId } = {}) {
    return {
        publish(partition, envelope) {
            return client.publish({ id: streamId, partition: partition }, envelope);
        },

        subscribe(partition, cb) {
            const waiting = client.subscribe(
                { id: streamId, partition: partition },
                (content, metadata) => {
                    try {
                        cb({ from: metadata.publisherId, envelope: content });
                    } catch (e) {
                        console.warn("channel message dropped", e);
                    }
                },
            );
            return async () => (await waiting).unsubscribe();
        },
    };
}
