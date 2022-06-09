import { ICactusPluginOptions } from "@hyperledger/cactus-core-api";
import { LogLevelDesc } from "loglevel";

export class PluginLedgerConnectorChia {
  constructor(public readonly options: IPluginLedgerConnectorChiaOptions) {}
}

export interface IPluginLedgerConnectorChiaOptions
  extends ICactusPluginOptions {
  logLevel?: LogLevelDesc;
}
