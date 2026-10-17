import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingState } from "@/components/ui/loading-state";
import { NavLinks } from "./nav-links";
import { getNavigationState } from "./navigation";

const pathnameMock = vi.hoisted(() => ({ value: "/approvals" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.value,
}));

function renderNav(pathname: string) {
  pathnameMock.value = pathname;
  return renderToStaticMarkup(<NavLinks />);
}

describe("getNavigationState", () => {
  it("marks an exact match as the current page", () => {
    expect(getNavigationState("/approvals", "/approvals")).toBe("page");
  });

  it("marks nested routes as the current location", () => {
    expect(getNavigationState("/approvals/act_1", "/approvals")).toBe("location");
    expect(getNavigationState("/runs/run_1", "/runs")).toBe("location");
  });

  it("does not match on a shared prefix that is not a path segment", () => {
    expect(getNavigationState("/approvals-archive", "/approvals")).toBeNull();
    expect(getNavigationState("/audit", "/approvals")).toBeNull();
  });
});

describe("NavLinks", () => {
  it("renders a labelled navigation landmark with named links", () => {
    const html = renderNav("/audit");

    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('href="/approvals"');
    expect(html).toContain('href="/runs"');
    expect(html).toContain('href="/audit"');
    for (const label of ["Approvals", "Live runs", "Audit log"]) {
      expect(html).toContain(label);
    }
  });

  it("sets aria-current=page only on the exact active link", () => {
    const html = renderNav("/audit");

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-current="location"');
  });

  it("keeps Approvals active on a nested action route", () => {
    const html = renderNav("/approvals/act_1");

    expect(html).toMatch(/aria-current="location"[^>]*href="\/approvals"/);
    expect(html).not.toContain('aria-current="page"');
  });
});

describe("PageHeader", () => {
  it("renders the title as h1 with description, breadcrumbs and actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Action details"
        description="Context"
        breadcrumbs={[{ label: "Approvals", href: "/approvals" }, { label: "Action details" }]}
        actions={<span>Slot</span>}
      />,
    );

    expect(html).toContain("<h1");
    expect(html).toContain("Context");
    expect(html).toContain("Slot");
    expect(html).toContain('aria-label="Breadcrumb"');
  });
});

describe("Breadcrumb", () => {
  it("links ancestors and marks the last item as the current page", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb items={[{ label: "Approvals", href: "/approvals" }, { label: "Detail" }]} />,
    );

    expect(html).toContain('href="/approvals"');
    expect(html).toMatch(/<span aria-current="page">Detail<\/span>/);
  });
});

describe("Button", () => {
  it("defaults to type=button and primary styling", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);

    expect(html).toContain('type="button"');
    expect(html).toContain("bg-accent");
  });

  it("applies variant classes and the disabled attribute", () => {
    const html = renderToStaticMarkup(
      <Button disabled variant="danger">
        Remove
      </Button>,
    );

    expect(html).toContain("bg-danger");
    expect(html).toContain("disabled");
  });

  it("is disabled and busy while loading", () => {
    const html = renderToStaticMarkup(<Button loading>Working</Button>);

    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
  });
});

describe("IconButton", () => {
  it("exposes its label as the accessible name", () => {
    const html = renderToStaticMarkup(
      <IconButton label="Open navigation menu">
        <svg aria-hidden="true" />
      </IconButton>,
    );

    expect(html).toContain('aria-label="Open navigation menu"');
  });
});

describe("Badge", () => {
  it("renders text content for each tone so meaning is not colour-only", () => {
    const html = renderToStaticMarkup(<Badge tone="danger">Rejected</Badge>);

    expect(html).toContain("Rejected");
    expect(html).toContain("bg-danger-soft");
  });
});

describe("LoadingState", () => {
  it("announces progress with role=status and a label", () => {
    const html = renderToStaticMarkup(<LoadingState label="Loading actions" />);

    expect(html).toContain('role="status"');
    expect(html).toContain("Loading actions");
  });
});
