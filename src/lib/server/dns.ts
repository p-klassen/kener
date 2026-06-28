import dns2 from "dns2";
import dgram from "dgram";
import { Resolver as NodeResolver } from "node:dns/promises";
import { AllRecordTypes } from "../clientTools";

interface DNSAnswer {
  name: string;
  ttl: number;
  address?: string;
  ns?: string;
  domain?: string;
  exchange?: string;
  priority?: number;
  data?: unknown;
}

interface DNSResponse {
  answers: DNSAnswer[];
}

interface DNSRecordResult {
  name: string;
  type: string;
  ttl: number;
  data: unknown;
}

class DNSResolver {
  nameserver: string;

  constructor() {
    this.nameserver = "8.8.8.8";
  }

  createQuery(domain: string, type: string): InstanceType<typeof dns2.Packet> {
    const packet = new dns2.Packet();
    // @ts-expect-error dns2 types are incomplete
    packet.header.id = 1;
    // @ts-expect-error dns2 types are incomplete
    packet.header.rd = 1;
    // @ts-expect-error dns2 types are incomplete
    packet.questions.push({
      name: domain,
      type: AllRecordTypes[type as keyof typeof AllRecordTypes],
      class: 1,
    });
    return packet;
  }

  async query(domain: string, recordType: string, nameserverOverride?: string, timeoutMs = 3000): Promise<DNSResponse> {
    // Each query gets its own socket to avoid concurrent-use races.
    const socket = dgram.createSocket("udp4");

    return new Promise((resolve, reject) => {
      const query = this.createQuery(domain, recordType);
      const buffer = query.toBuffer();
      const targetNameserver = nameserverOverride || this.nameserver;

      const cleanup = () => {
        try { socket.close(); } catch { /* already closed */ }
      };

      const onMessage = (message: Buffer) => {
        clearTimeout(timeoutId);
        cleanup();
        // @ts-expect-error dns2 types are incomplete
        const response = dns2.Packet.parse(message) as DNSResponse;
        resolve(response);
      };

      const timeoutId = setTimeout(() => {
        socket.removeListener("message", onMessage);
        cleanup();
        reject(new Error(`DNS query timed out for ${domain} (${recordType}) via ${targetNameserver}`));
      }, timeoutMs);

      socket.once("message", onMessage);

      socket.send(buffer, 0, buffer.length, 53, targetNameserver, (err: Error | null) => {
        if (err) {
          clearTimeout(timeoutId);
          socket.removeListener("message", onMessage);
          cleanup();
          reject(err);
        }
      });
    });
  }

  async getAuthoritativeNameServers(domain: string, resolverNameserver?: string): Promise<string[]> {
    const resolver = new NodeResolver();
    resolver.setServers([resolverNameserver || this.nameserver]);

    const labels = domain.replace(/\.$/, "").split(".");
    for (let i = 0; i <= labels.length - 2; i++) {
      const zone = labels.slice(i).join(".");
      try {
        const nameServers = await resolver.resolveNs(zone);
        if (nameServers.length > 0) {
          return nameServers;
        }
      } catch {
        // Try parent zone
      }
    }

    return [];
  }

  async queryAuthoritativeRecord(
    domain: string,
    recordType: string,
    fallbackNameserver?: string,
    timeoutMs = 3000,
  ): Promise<DNSResponse> {
    const authoritativeNameServers = await this.getAuthoritativeNameServers(domain, fallbackNameserver);

    for (const ns of authoritativeNameServers) {
      try {
        const response = await this.query(domain, recordType, ns, timeoutMs);
        if (response.answers && response.answers.length > 0) {
          return response;
        }
      } catch {
        // Try next authoritative nameserver
      }
    }

    // Fallback to configured recursive resolver
    return await this.query(domain, recordType, fallbackNameserver, timeoutMs);
  }

  extractData(answer: DNSAnswer, recordType: string): unknown {
    switch (recordType) {
      case "A":
      case "AAAA":
        return answer.address;
      case "NS":
        return answer.ns;
      case "CNAME":
        return answer.domain;
      case "MX":
        return answer.exchange;
      default:
        return answer.data;
    }
  }

  async getRecord(
    domain: string,
    recordType: string,
    nameserverOverride?: string,
    timeoutMs = 3000,
  ): Promise<Record<string, DNSRecordResult[]>> {
    const results: Record<string, DNSRecordResult[]> = {};

    try {
      const response = await this.queryAuthoritativeRecord(domain, recordType, nameserverOverride, timeoutMs);
      results[recordType] = response.answers.map((answer: DNSAnswer) => ({
        name: answer.name,
        type: recordType,
        ttl: answer.ttl,
        data: this.extractData(answer, recordType),
      }));
      return results;
    } catch (error) {
      console.error("Error querying DNS records:", error);
      throw error;
    }
  }
}

export default DNSResolver;
