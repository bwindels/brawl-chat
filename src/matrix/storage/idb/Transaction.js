/*
Copyright 2020 Bruno Windels <bruno@windels.cloud>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {txnAsPromise} from "./utils.js";
import {StorageError} from "../common.js";
import {Store} from "./Store.js";
import {SessionStore} from "./stores/SessionStore.js";
import {RoomSummaryStore} from "./stores/RoomSummaryStore.js";
import {TimelineEventStore} from "./stores/TimelineEventStore.js";
import {RoomStateStore} from "./stores/RoomStateStore.js";
import {TimelineFragmentStore} from "./stores/TimelineFragmentStore.js";
import {PendingEventStore} from "./stores/PendingEventStore.js";

export class Transaction {
    constructor(txn, allowedStoreNames) {
        this._txn = txn;
        this._allowedStoreNames = allowedStoreNames;
        this._stores = {
            session: null,
            roomSummary: null,
            roomTimeline: null,
            roomState: null,
        };
    }

    _idbStore(name) {
        if (!this._allowedStoreNames.includes(name)) {
            // more specific error? this is a bug, so maybe not ...
            throw new StorageError(`Invalid store for transaction: ${name}, only ${this._allowedStoreNames.join(", ")} are allowed.`);
        }
        return new Store(this._txn.objectStore(name));
    }

    _store(name, mapStore) {
        if (!this._stores[name]) {
            const idbStore = this._idbStore(name);
            this._stores[name] = mapStore(idbStore);
        }
        return this._stores[name];
    }

    get session() {
        return this._store("session", idbStore => new SessionStore(idbStore));
    }

    get roomSummary() {
        return this._store("roomSummary", idbStore => new RoomSummaryStore(idbStore));
    }

    get timelineFragments() {
        return this._store("timelineFragments", idbStore => new TimelineFragmentStore(idbStore));
    }

    get timelineEvents() {
        return this._store("timelineEvents", idbStore => new TimelineEventStore(idbStore));
    }

    get roomState() {
        return this._store("roomState", idbStore => new RoomStateStore(idbStore));
    }

    get pendingEvents() {
        return this._store("pendingEvents", idbStore => new PendingEventStore(idbStore));
    }

    complete() {
        return txnAsPromise(this._txn);
    }

    abort() {
        this._txn.abort();
    }
}
