import {
  Bools,
  Checks,
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";
import Docker, { Container, ContainerInfo } from "dockerode";
import { EventEmitter } from "stream";
import { ITestLedger } from "../i-test-ledger";
import { Containers } from "../common/containers";
import Joi from "joi";

export interface IChiaTestLedgerConstructorOptions {
  imageVersion?: string;
  imageName?: string;
  envVars?: string[];
  emitContainerLogs?: boolean;
  logLevel?: LogLevelDesc;
}

const DEFAULTS = Object.freeze({
  imageName: "ghcr.io/hyperledger/chia-all-in-one",
  imageVersion: "v1.0.0",
  envVars: [""],
});

export const CHIA_TEST_LEDGER_OPTIONS_JOI_SCHEMA: Joi.Schema = Joi.object().keys(
  {
    imageVersion: Joi.string().min(5).required(),
    imageName: Joi.string().min(1).required(),
  },
);

export class ChiaTestLedger implements ITestLedger {
  public static readonly CLASS_NAME = "ChiaTestLedger";

  private readonly log: Logger;
  private readonly envVars: string[];

  public get className(): string {
    return ChiaTestLedger.CLASS_NAME;
  }

  public readonly imageVersion?: string;
  public readonly imageName?: string;
  public readonly emitContainerLogs: boolean;

  private container: Container | undefined;
  private containerId: string | undefined;

  constructor(public readonly opts: IChiaTestLedgerConstructorOptions) {
    const fnTag = `${this.className}#constructor()`;
    Checks.truthy(opts, `${fnTag} options`);

    this.imageVersion = opts.imageVersion || DEFAULTS.imageVersion;
    this.imageName = opts.imageName || DEFAULTS.imageName;

    this.emitContainerLogs = Bools.isBooleanStrict(opts.emitContainerLogs)
      ? (opts.emitContainerLogs as boolean)
      : true;

    this.envVars = opts.envVars ? opts.envVars : DEFAULTS.envVars;
    Checks.truthy(Array.isArray(this.envVars), `${fnTag}:envVars not an array`);

    //this.validateConstructorOptions();
    const label = "chia-test-ledger";
    const level = opts.logLevel || "INFO";
    this.log = LoggerProvider.getOrCreate({ level, label });
  }

  public getContainerId(): string {
    const fnTag = `${this.className}.getContainerId()`;
    Checks.nonBlankString(this.containerId, `${fnTag}::containerId`);
    return this.containerId as string;
  }

  public getContainerImageName(): string {
    return `${this.imageName}:${this.imageVersion}`;
  }

  public async start(): Promise<Container> {
    const imageFqn = this.getContainerImageName();

    if (this.container) {
      await this.container.stop();
      await this.container.remove();
    }
    const docker = new Docker();

    return new Promise<Container>((resolve, reject) => {
      const eventEmitter: EventEmitter = docker.run(
        imageFqn,
        [],
        [],
        {
          User: "root",
          ExposedPorts: {
            "22/tcp": {}, // ssh server
          },
          PublishAllPorts: true,
          Privileged: true,
          Env: this.envVars,
        },
        {},
        (err: unknown) => {
          if (err) {
            reject(err);
          }
        },
      );

      eventEmitter.once("start", async (container: Container) => {
        this.container = container;
        this.containerId = container.id;

        if (this.emitContainerLogs) {
          const fnTag = `[${this.getContainerImageName()}]`;
          await Containers.streamLogs({
            container: this.getContainer(),
            tag: fnTag,
            log: this.log,
          });
        }

        try {
          let isHealthy = false;
          do {
            const containerInfo = await this.getContainerInfo();
            this.log.debug(`ContainerInfo.Status=%o`, containerInfo.Status);
            this.log.debug(`ContainerInfo.State=%o`, containerInfo.State);
            isHealthy = containerInfo.Status.endsWith("(healthy)");
            if (!isHealthy) {
              await new Promise((resolve2) => setTimeout(resolve2, 1000));
            }
          } while (!isHealthy);
          resolve(container);
        } catch (ex) {
          reject(ex);
        }
      });
    });
  }

  public stop(): Promise<unknown> {
    return Containers.stop(this.getContainer());
  }

  public destroy(): Promise<unknown> {
    const fnTag = `${this.className}.destroy()`;
    if (this.container) {
      return this.container.remove();
    } else {
      return Promise.reject(
        new Error(`${fnTag} Container was never created, nothing to destroy.`),
      );
    }
  }

  public getContainer(): Container {
    const fnTag = `${this.className}.getContainer()`;
    if (!this.container) {
      throw new Error(`${fnTag} container not set on this instance yet.`);
    } else {
      return this.container;
    }
  }

  protected async getContainerInfo(): Promise<ContainerInfo> {
    const fnTag = `${this.className}.getContainerInfo()`;
    const docker = new Docker();
    const containerInfos = await docker.listContainers({});
    const id = this.getContainerId();

    const aContainerInfo = containerInfos.find((ci) => ci.Id === id);

    if (aContainerInfo) {
      return aContainerInfo;
    } else {
      throw new Error(`${fnTag} no container with ID "${id}"`);
    }
  }

  public async getContainerIpAddress(): Promise<string> {
    const fnTag = "BesuTestLedger#getContainerIpAddress()";
    const aContainerInfo = await this.getContainerInfo();

    if (aContainerInfo) {
      const { NetworkSettings } = aContainerInfo;
      const networkNames: string[] = Object.keys(NetworkSettings.Networks);
      if (networkNames.length < 1) {
        throw new Error(`${fnTag} container not connected to any networks`);
      } else {
        // return IP address of container on the first network that we found
        // it connected to. Make this configurable?
        return NetworkSettings.Networks[networkNames[0]].IPAddress;
      }
    } else {
      throw new Error(`${fnTag} cannot find image: ${this.imageName}`);
    }
  }

  private validateConstructorOptions(): void {
    const validationResult = CHIA_TEST_LEDGER_OPTIONS_JOI_SCHEMA.validate({
      imageVersion: this.imageVersion,
      imageName: this.imageName,
    });

    if (validationResult.error) {
      throw new Error(
        `ChiaTestLedger#ctor ${validationResult.error.annotate()}`,
      );
    }
  }

  private pullContainerImage(containerNameAndTag: string): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const docker = new Docker();
      docker.pull(containerNameAndTag, (pullError: unknown, stream: never) => {
        if (pullError) {
          reject(pullError);
        } else {
          docker.modem.followProgress(
            stream,
            (progressError: unknown, output: unknown[]) => {
              if (progressError) {
                reject(progressError);
              } else {
                resolve(output);
              }
            },
          );
        }
      });
    });
  }
}
