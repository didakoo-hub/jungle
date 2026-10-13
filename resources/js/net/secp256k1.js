import { secp256k1 } from "@noble/curves/secp256k1";

// Stands in for the `secp256k1` package in the browser bundle (vite.config.js), so that
// @streamr/utils signs without elliptic. Only the three calls Streamr makes.

const outputOf = (output = (len) => new Uint8Array(len), length) =>
    typeof output === "function" ? output(length) : output;

const filled = (output, bytes) => {
    if (!(output instanceof Uint8Array) || output.length !== bytes.length) {
        throw new Error(`Expected output to be an Uint8Array with length ${bytes.length}`);
    }
    output.set(bytes);
    return output;
};

const bytes32 = (name, value) => {
    if (!(value instanceof Uint8Array) || value.length !== 32) {
        throw new Error(`Expected ${name} to be an Uint8Array with length 32`);
    }
};

function publicKeyCreate(seckey, compressed = true, output) {
    bytes32("private key", seckey);
    return filled(outputOf(output, compressed ? 33 : 65), secp256k1.getPublicKey(seckey, compressed));
}

function ecdsaSign(msg32, seckey, options = {}, output) {
    bytes32("message", msg32);
    bytes32("private key", seckey);
    const sig = secp256k1.sign(msg32, seckey, { lowS: true });
    return { signature: filled(outputOf(output, 64), sig.toCompactRawBytes()), recid: sig.recovery };
}

function ecdsaRecover(sig, recid, msg32, compressed = true, output) {
    if (!(sig instanceof Uint8Array) || sig.length !== 64) {
        throw new Error("Expected signature to be an Uint8Array with length 64");
    }
    if (!Number.isInteger(recid) || recid < 0 || recid > 3) {
        throw new Error("Expected recovery id to be a Number within interval [0, 3]");
    }
    bytes32("message", msg32);
    const point = secp256k1.Signature.fromCompact(sig).addRecoveryBit(recid).recoverPublicKey(msg32);
    return filled(outputOf(output, compressed ? 33 : 65), point.toRawBytes(compressed));
}

export default { publicKeyCreate, ecdsaSign, ecdsaRecover };
export { publicKeyCreate, ecdsaSign, ecdsaRecover };
