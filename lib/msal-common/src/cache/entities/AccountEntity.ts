/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Separators,
    CacheAccountType,
    EnvironmentAliases,
    PreferredCacheEnvironment,
    CacheType,
} from "../../utils/Constants";
import { Authority } from "../../authority/Authority";
import { IdToken } from "../../account/IdToken";
import { ICrypto } from "../../crypto/ICrypto";
import { buildClientInfo } from "../../account/ClientInfo";
import { StringUtils } from "../../utils/StringUtils";
import { AccountInfo } from "../../account/AccountInfo";

/**
 * Type that defines required and optional parameters for an Account field (based on universal cache schema implemented by all MSALs).
 * 
 * Key : Value Schema
 * 
 * Key: <home_account_id>-<environment>-<realm*>
 * 
 * Value Schema:
 * {
 *      homeAccountId: home account identifier for the auth scheme,
 *      environment: entity that issued the token, represented as a full host
 *      realm: Full tenant or organizational identifier that the account belongs to
 *      localAccountId: Original tenant-specific accountID, usually used for legacy cases
 *      username: primary username that represents the user, usually corresponds to preferred_username in the v2 endpt
 *      authorityType: Accounts authority type as a string
 *      name: Full name for the account, including given name and family name,
 *      clientInfo: Full base64 encoded client info received from ESTS
 *      lastModificationTime: last time this entity was modified in the cache
 *      lastModificationApp: 
 * }
 */
export class AccountEntity {
    homeAccountId: string;
    environment: string;
    realm: string;
    localAccountId: string;
    username: string;
    authorityType: string;
    name?: string;
    clientInfo?: string;
    lastModificationTime?: string;
    lastModificationApp?: string;

    /**
     * Generate Account Id key component as per the schema: <home_account_id>-<environment>
     */
    generateAccountId(): string {
        const accountId: Array<string> = [this.homeAccountId, this.environment];
        return accountId.join(Separators.CACHE_KEY_SEPARATOR).toLowerCase();
    }

    /**
     * Generate Account Cache Key as per the schema: <home_account_id>-<environment>-<realm*>
     */
    generateAccountKey(): string {
        return AccountEntity.generateAccountCacheKey({
            homeAccountId: this.homeAccountId,
            environment: this.environment,
            tenantId: this.realm,
            username: this.username
        });
    }

    /**
     * returns the type of the cache (in this case account)
     */
    generateType(): number {
        switch (this.authorityType) {
            case CacheAccountType.ADFS_ACCOUNT_TYPE:
                return CacheType.ADFS;
            case CacheAccountType.MSAV1_ACCOUNT_TYPE:
                return CacheType.MSA;
            case CacheAccountType.MSSTS_ACCOUNT_TYPE:
                return CacheType.MSSTS;
            case CacheAccountType.GENERIC_ACCOUNT_TYPE:
                return CacheType.GENERIC;
            default: {
                console.log("Unexpected account type");
                return null;
            }
        }
    }

    /**
     * Returns the AccountInfo interface for this account.
     */
    getAccountInfo(): AccountInfo {
        return {
            homeAccountId: this.homeAccountId,
            environment: this.environment,
            tenantId: this.realm,
            username: this.username
        };
    }

    /**
     * Generates account key from interface
     * @param accountInterface
     */
    static generateAccountCacheKey(accountInterface: AccountInfo): string {
        const accountKey = [
            accountInterface.homeAccountId,
            accountInterface.environment || "",
            accountInterface.tenantId || "",
        ];

        return accountKey.join(Separators.CACHE_KEY_SEPARATOR).toLowerCase();
    }

    /**
     * Build Account cache from IdToken, clientInfo and authority/policy
     * @param clientInfo
     * @param authority
     * @param idToken
     * @param policy
     */
    static createAccount(
        clientInfo: string,
        authority: Authority,
        idToken: IdToken,
        policy: string,
        crypto: ICrypto
    ): AccountEntity {
        const account: AccountEntity = new AccountEntity();

        account.authorityType = CacheAccountType.MSSTS_ACCOUNT_TYPE;
        account.clientInfo = clientInfo;
        // TBD: Clarify "policy" addition
        const clientInfoObj = buildClientInfo(clientInfo, crypto);
        const homeAccountId = `${clientInfoObj.uid}${Separators.CLIENT_INFO_SEPARATOR}${clientInfoObj.utid}`;
        account.homeAccountId =
            policy !== null
                ? homeAccountId + Separators.CACHE_KEY_SEPARATOR + policy
                : homeAccountId;

        const reqEnvironment =
            authority.canonicalAuthorityUrlComponents.HostNameAndPort;
        account.environment = EnvironmentAliases.includes(reqEnvironment)
            ? PreferredCacheEnvironment
            : reqEnvironment;

        account.realm = idToken.claims.tid;

        if (idToken) {
            // How do you account for MSA CID here?
            const localAccountId = !StringUtils.isEmpty(idToken.claims.oid)
                ? idToken.claims.oid
                : idToken.claims.sid;
            account.localAccountId = localAccountId;
            account.username = idToken.claims.preferred_username;
            account.name = idToken.claims.name;
        }

        return account;
    }

    /**
     * Build ADFS account type
     * @param authority
     * @param idToken
     */
    static createADFSAccount(
        authority: Authority,
        idToken: IdToken
    ): AccountEntity {
        const account: AccountEntity = new AccountEntity();

        account.authorityType = CacheAccountType.ADFS_ACCOUNT_TYPE;
        account.homeAccountId = idToken.claims.sub;
        account.environment =
            authority.canonicalAuthorityUrlComponents.HostNameAndPort;
        account.username = idToken.claims.upn;
        // add uniqueName to claims
        // account.name = idToken.claims.uniqueName;

        return account;
    }
}
