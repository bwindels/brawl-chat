// import SummaryMembers from "./members";


function applySyncResponse(data, roomResponse, membership) {
    if (roomResponse.summary) {
        data = updateSummary(data, roomResponse.summary);
    }
    if (membership !== this._membership) {
        data = data.cloneIfNeeded();
        data.membership = membership;
    }
    // state comes before timeline
    if (roomResponse.state) {
        data = roomResponse.state.events.reduce(processEvent, data);
    }
    if (roomResponse.timeline) {
        data = roomResponse.timeline.events.reduce(processEvent, data);
    }

    return data;
}

function processEvent(data, event) {
    if (event.type === "m.room.encryption") {
        if (!data.isEncrypted) {
            data = data.cloneIfNeeded();
            data.isEncrypted = true;
        }
    }
    if (event.type === "m.room.name") {
        const newName = event.content && event.content.name;
        if (newName !== data.name) {
            data = data.cloneIfNeeded();
            data.name = newName;
        }
    } else if (event.type === "m.room.member") {
        data = processMembership(data, event);
    } else if (event.type === "m.room.message") {
        const content = event.content;
        const body = content && content.body;
        const msgtype = content && content.msgtype;
        if (msgtype === "m.text") {
            data = data.cloneIfNeeded();
            data.lastMessageBody = body;
        }
    } else if (event.type === "m.room.canonical_alias") {
        const content = event.content;
        data = data.cloneIfNeeded();
        data.canonicalAlias = content.alias;
    } else if (event.type === "m.room.aliases") {
        const content = event.content;
        data = data.cloneIfNeeded();
        data.aliases = content.aliases;
    }
    return data;
}

function processMembership(data, event) {
    const prevMembership = event.prev_content && event.prev_content.membership;
    if (!event.content) {
        return data;
    }
    const content = event.content;
    const membership = content.membership;
    // danger of a replayed event getting the count out of sync
    // but summary api will solve this.
    // otherwise we'd have to store all the member ids in here
    if (membership !== prevMembership) {
        data = data.cloneIfNeeded();
        switch (prevMembership) {
            case "invite": data.inviteCount -= 1; break;
            case "join": data.joinCount -= 1; break;
        }
        switch (membership) {
            case "invite": data.inviteCount += 1; break;
            case "join": data.joinCount += 1; break;
        }
    }
    return data;
}

function updateSummary(data, summary) {
    const heroes = summary["m.heroes"];
    const inviteCount = summary["m.joined_member_count"];
    const joinCount = summary["m.invited_member_count"];

    if (heroes) {
        data = data.cloneIfNeeded();
        data.heroes = heroes;
    }
    if (Number.isInteger(inviteCount)) {
        data = data.cloneIfNeeded();
        data.inviteCount = inviteCount;
    }
    if (Number.isInteger(joinCount)) {
        data = data.cloneIfNeeded();
        data.joinCount = joinCount;
    }
    return data;
}

class SummaryData extends ChangeSet {
    constructor(copy, roomId) {
        this.roomId = copy ? copy.roomId : roomId;
        this.name = copy ? copy.name : null;
        this.lastMessageBody = copy ? copy.lastMessageBody : null;
        this.unreadCount = copy ? copy.unreadCount : null;
        this.mentionCount = copy ? copy.mentionCount : null;
        this.isEncrypted = copy ? copy.isEncrypted : null;
        this.isDirectMessage = copy ? copy.isDirectMessage : null;
        this.membership = copy ? copy.membership : null;
        this.inviteCount = copy ? copy.inviteCount : 0;
        this.joinCount = copy ? copy.joinCount : 0;
        this.readMarkerEventId = copy ? copy.readMarkerEventId : null;
        this.heroes = copy ? copy.heroes : null;
        this.canonicalAlias = copy ? copy.canonicalAlias : null;
        this.aliases = copy ? copy.aliases : null;
        this.cloned = copy ? true : false;
    }

    cloneIfNeeded() {
        if (this.cloned) {
            return this;
        } else {
            return new SummaryData(this);
        }
    }

    serialize() {
        const {cloned, ...serializedProps} = this;
        return serializedProps;
    }
}

export default class RoomSummary {
	constructor(roomId) {
        this._data = new SummaryData(null, roomId);
	}

	get name() {
		if (this._data.name) {
            return this._data.name;
        }
        if (this._data.canonicalAlias) {
            return this._data.canonicalAlias;
        }
        if (Array.isArray(this._data.aliases) && this._data.aliases.length !== 0) {
            return this._data.aliases[0];
        }
        if (Array.isArray(this._data.heroes) && this._data.heroes.length !== 0) {
            return this._data.heroes.join(", ");
        }
        return this._data.roomId;
	}

	get lastMessage() {
		return this._data.lastMessageBody;
	}

	get inviteCount() {
		return this._data.inviteCount;
	}

	get joinCount() {
		return this._data.joinCount;
	}

	writeSync(roomResponse, membership, txn) {
        // clear cloned flag, so cloneIfNeeded makes a copy and
        // this._data is not modified if any field is changed.
        this._data.cloned = false;
		const data = applySyncResponse(this._data, roomResponse, membership);
		if (data !== this._data) {
            // need to think here how we want to persist
            // things like unread status (as read marker, or unread count)?
            // we could very well load additional things in the load method
            // ... the trade-off is between constantly writing the summary
            // on every sync, or doing a bit of extra reading on load
            // and have in-memory only variables for visualization
            
            // TODO: we don't want to write "cloned" here? values doesn't exist anymore in any case
            txn.roomSummary.set(data.serialize());
            return data;
		}
	}

    afterSync(data) {
        this._data = data;
    }

	async load(summary) {
        this._data = new SummaryData(summary);
	}
}

export function tests() {
    return {
        "membership trigger change": function(assert) {
            const summary = new RoomSummary("id");
            const changes = summary.writeSync({}, "join");
            assert(changes);
            assert(changes.changed);
        }
    }
}
