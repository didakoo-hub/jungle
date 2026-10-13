import { TypedDataEncoder, verifyTypedData } from "ethers";
import { CHAIN_ID, MATCH_ADDRESS } from "./constants.js";

export const DOMAIN = Object.freeze({ name: "Jungle", version: "1", chainId: CHAIN_ID });

export function domainMatch(contract = MATCH_ADDRESS) {
    return Object.freeze({ ...DOMAIN, verifyingContract: contract });
}

export const MATCH_DOMAIN = domainMatch();

export function signature(key, types, value, domain = DOMAIN) {
    return key.sign(TypedDataEncoder.hash(domain, types, value)).serialized;
}

export function signerOf(types, value, signatureSerialized, domain = DOMAIN) {
    try {
        return verifyTypedData(domain, types, value, signatureSerialized);
    } catch {
        return null;
    }
}

export function digest(types, value, domain = DOMAIN) {
    return TypedDataEncoder.hash(domain, types, value);
}
