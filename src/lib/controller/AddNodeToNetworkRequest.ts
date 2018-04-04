import { CommandClasses } from "../commandclass/CommandClass";
import { FunctionType, MessagePriority, MessageType } from "../message/Constants";
import { expectedResponse, Message, messageTypes, priority } from "../message/Message";
import { BasicDeviceClasses, GenericDeviceClass, SpecificDeviceClass } from "../node/DeviceClass";

export enum AddNodeType {
	Any = 1,
	Controller = 2,
	Slave = 3,
	Existing = 4,
	Stop = 5,
	StopFailed = 6, // what is this?
}

export enum AddNodeStatus {
	Ready = 1,
	NodeFound = 2,
	AddingSlave = 3,
	AddingController = 4,
	ProtocolDone = 5,
	Done = 6,
	Failed = 7,
}

const enum AddNodeFlags {
	HighPower = 0x80,
	NetworkWide = 0x40,
}

@messageTypes(MessageType.Request, FunctionType.AddNodeToNetwork)
// no expected response, the controller will respond with another AddNodeToNetworkRequest
@priority(MessagePriority.Controller)
export class AddNodeToNetworkRequest extends Message {

	// tslint:disable:unified-signatures
	// empty constructor to parse messages
	constructor();
	// default constructor to send messages
	constructor(
		addNodeType?: AddNodeType,
		highPower?: boolean,
		networkWide?: boolean,
	);
	constructor(
		/** The type of node to add */
		public addNodeType: AddNodeType = AddNodeType.Any,
		/** Whether to use high power */
		public highPower?: boolean,
		/** Whether to include network wide */
		public networkWide?: boolean,
	) {
		super();
	}
	// tslint:enable:unified-signatures

	private _status: AddNodeStatus;
	public get status(): AddNodeStatus {
		return this._status;
	}

	private _statusContext: AddNodeStatusContext;
	public get statusContext(): AddNodeStatusContext {
		return this._statusContext;
	}

	public serialize(): Buffer {
		let data: number = this.addNodeType;
		if (this.highPower) data |= AddNodeFlags.HighPower;
		if (this.networkWide) data |= AddNodeFlags.NetworkWide;

		this.payload = Buffer.from([data]);

		return super.serialize();
	}

	// this is for reports from the controller
	public deserialize(data: Buffer): number {
		const ret = super.deserialize(data);

		// not sure what the value in payload[0] means
		this._status = this.payload[1];
		switch (this._status) {
			case AddNodeStatus.Ready:
			case AddNodeStatus.NodeFound:
			case AddNodeStatus.ProtocolDone:
			case AddNodeStatus.Failed:
				// no context for the status to parse
				break;

			case AddNodeStatus.AddingController:
			case AddNodeStatus.Done:
				// When a controller is added, or an inclusion is finished,
				// the node ID is transmitted in payload byte #2
				this._statusContext = { nodeId: this.payload[2] };
				break;

			case AddNodeStatus.AddingSlave: {
				// the payload contains the node ID, basic, generic and specific class, and a list of CCs
				this._statusContext = {
					nodeId: this.payload[2],
					// length is 3
					basic: this.payload[4],
					generic: GenericDeviceClass.get(this.payload[5]),
					specific: SpecificDeviceClass.get(this.payload[5], this.payload[6]),
					supportedCCs: [],
					controlledCCs: [],
				};
				// split the CCs into supported/controlled
				// tslint:disable-next-line:variable-name
				const CCs = [...this.payload.slice(7)];
				let isAfterMark: boolean = false;
				for (const cc of CCs) {
					// CCs before the support/control mark are supported
					// CCs after the support/control mark are controlled
					if (cc === CommandClasses["Support/Control Mark"]) {
						isAfterMark = true;
						continue;
					}
					(isAfterMark
						? this._statusContext.controlledCCs
						: this._statusContext.supportedCCs
					).push(cc);
				}
				break;
			}
		}

		return ret;
	}

	public toJSON() {
		return super.toJSONInherited({
			status: AddNodeStatus[this.status],
			statusContext: this.statusContext,
			payload: this.statusContext != null ? undefined : this.payload,
		});
	}

}

export interface AddNodeStatusContext {
	nodeId: number;
	basic?: BasicDeviceClasses;
	generic?: GenericDeviceClass;
	specific?: SpecificDeviceClass;
	supportedCCs?: CommandClasses[];
	controlledCCs?: CommandClasses[];
}

// example inclusion:
// {
//     "name": "AddNodeToNetworkRequest",
//     "type": "Request",
//     "functionType": "AddNodeToNetwork",
//     "status": "NodeFound"
// }

// {
//     "name": "AddNodeToNetworkRequest",
//     "type": "Request",
//     "functionType": "AddNodeToNetwork",
//     "status": "AddingSlave",
//     "statusContext": {
//         "nodeId": 3,
//         "basic": 21,
//         "generic": {
//             "name": "Display",
//             "key": 4,
//             "mandatorySupportedCCs": [
//                 32
//             ],
//             "mandatoryControlCCs": [],
//             "specificDeviceClasses": {}
//         },
//         "specific": {
//             "name": "UNKNOWN (0x18)",
//             "key": 24,
//             "mandatorySupportedCCs": [],
//             "mandatoryControlCCs": [],
//             "basicCCForbidden": false
//         },
//         "CCs": {
//             "type": "Buffer",
//             "data": [
//                 1,
//                 94,
//                 133,
//                 89,
//                 142,
//                 96,
//                 134,
//                 112,
//                 114,
//                 90,
//                 115,
//                 132,
//                 128,
//                 91,
//                 113,
//                 122,
//                 239,
//                 37,
//                 38
//             ]
//         }
//     }
// }

// {
//     "name": "AddNodeToNetworkRequest",
//     "type": "Request",
//     "functionType": "AddNodeToNetwork",
//     "status": "ProtocolDone"
// }
