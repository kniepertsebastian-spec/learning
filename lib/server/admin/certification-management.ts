import { getDb } from "@/lib/server/db/client";
import { certifications, domains } from "@/lib/server/db/schema";

/**
 * Service for managing multiple certifications
 * Architecture is already certification-agnostic, this enables easy addition
 */
export interface CertificationTemplate {
  slug: string;
  name: string;
  provider: string;
  examName: string;
  examVersion: string;
  domains: Array<{
    orderNum: number;
    name: string;
    weightPercent: number;
  }>;
}

export class CertificationManagementService {
  /**
   * Creates a new certification with its domain structure
   * Typically called during setup/seeding
   */
  static async createCertificationWithDomains(
    template: CertificationTemplate,
  ): Promise<{
    certificationId: string;
    domainsCreated: number;
  }> {
    const db = getDb();

    // Create certification
    const certInserted = await db
      .insert(certifications)
      .values({
        slug: template.slug,
        name: template.name,
        provider: template.provider,
        examName: template.examName,
        examVersion: template.examVersion,
      })
      .returning();

    const certId = certInserted[0].id;

    // Create domains
    const domainValues = template.domains.map((d) => ({
      certificationId: certId,
      orderNum: d.orderNum,
      name: d.name,
      weightPercent: d.weightPercent.toString(),
    }));

    await db.insert(domains).values(domainValues);

    return {
      certificationId: certId,
      domainsCreated: template.domains.length,
    };
  }

  /**
   * Template for CompTIA Security+ (already in use)
   */
  static securityPlusTemplate(): CertificationTemplate {
    return {
      slug: "security-plus",
      name: "CompTIA Security+",
      provider: "CompTIA",
      examName: "SY0-701",
      examVersion: "v1",
      domains: [
        { orderNum: 1, name: "Security Concepts", weightPercent: 21 },
        { orderNum: 2, name: "Threats, Vulnerabilities, and Mitigations", weightPercent: 23 },
        { orderNum: 3, name: "Application, Data, and Host Security", weightPercent: 16 },
        { orderNum: 4, name: "Security Architecture and Engineering", weightPercent: 17 },
        { orderNum: 5, name: "Identity and Access Management", weightPercent: 16 },
        { orderNum: 6, name: "Cryptography", weightPercent: 7 },
      ],
    };
  }

  /**
   * Template for CompTIA Network+
   */
  static networkPlusTemplate(): CertificationTemplate {
    return {
      slug: "network-plus",
      name: "CompTIA Network+",
      provider: "CompTIA",
      examName: "N10-008",
      examVersion: "v1",
      domains: [
        { orderNum: 1, name: "Networking Concepts", weightPercent: 23 },
        { orderNum: 2, name: "Infrastructure", weightPercent: 18 },
        { orderNum: 3, name: "Network Operations", weightPercent: 16 },
        { orderNum: 4, name: "Network Security", weightPercent: 19 },
        { orderNum: 5, name: "Network Troubleshooting", weightPercent: 24 },
      ],
    };
  }

  /**
   * Template for AWS Solutions Architect Associate
   */
  static awsSAATemplate(): CertificationTemplate {
    return {
      slug: "aws-saa",
      name: "AWS Solutions Architect Associate",
      provider: "Amazon Web Services",
      examName: "SAA-C03",
      examVersion: "v1",
      domains: [
        { orderNum: 1, name: "Design Secure Architectures", weightPercent: 30 },
        { orderNum: 2, name: "Design Resilient Architectures", weightPercent: 26 },
        { orderNum: 3, name: "Design High-Performing Architectures", weightPercent: 20 },
        { orderNum: 4, name: "Design Cost-Optimized Architectures", weightPercent: 24 },
      ],
    };
  }

  /**
   * List of available certification templates
   */
  static getAvailableTemplates(): CertificationTemplate[] {
    return [
      this.securityPlusTemplate(),
      this.networkPlusTemplate(),
      this.awsSAATemplate(),
    ];
  }

  /**
   * Gets migration path - suggesting related certifications
   */
  static getMigrationPaths(): Record<string, string[]> {
    return {
      "security-plus": ["network-plus", "aws-saa"],
      "network-plus": ["security-plus", "aws-saa"],
      "aws-saa": ["security-plus", "network-plus"],
    };
  }
}
