export function fakeTransport({ lose = () => false, duplicate = () => false } = {}) {
    const subscribed = new Map();
    const transmittedAll = [];

    function subscribe(partition, cb) {
        if (!subscribed.has(partition)) subscribed.set(partition, new Set());
        subscribed.get(partition).add(cb);
        return () => subscribed.get(partition)?.delete(cb);
    }

    return {
        transmittedAll,
        per(address) {
            return {
                async publish(partition, envelope) {
                    transmittedAll.push({ partition, from: address, envelope });
                    if (lose(envelope)) return;
                    const rounds = duplicate(envelope) ? 2 : 1;
                    for (let i = 0; i < rounds; i++) {
                        for (const cb of subscribed.get(partition) ?? []) {
                            cb({ from: address, envelope: JSON.parse(JSON.stringify(envelope)) });
                        }
                    }
                },
                subscribe,
            };
        },
        subscribe,
    };
}
