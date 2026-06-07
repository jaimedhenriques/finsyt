import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateManifestXml } from "./validate-excel-manifest.js";

const minimalValid = `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp>
  <Id>e8d2f5c0-9a63-4d2e-bd8d-1f2a3b4c5dde</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>Finsyt</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="Finsyt"/>
  <Description DefaultValue="x"/>
  <Hosts><Host Name="Workbook"/></Hosts>
  <DefaultSettings>
    <SourceLocation DefaultValue="https://finsyt.com/x"/>
  </DefaultSettings>
  <VersionOverrides>
    <Hosts>
      <Host>
        <DesktopFormFactor>
          <ExtensionPoint>
            <Control>
              <Label resid="Finsyt.OpenLabel"/>
              <Supertip>
                <Title resid="Finsyt.OpenLabel"/>
                <Description resid="Finsyt.OpenDesc"/>
              </Supertip>
              <Icon><bt:Image size="16" resid="Finsyt.Icon16"/></Icon>
              <Action>
                <TaskpaneId>FinsytA</TaskpaneId>
                <SourceLocation resid="Finsyt.Taskpane"/>
              </Action>
            </Control>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
    <Resources>
      <bt:Images>
        <bt:Image id="Finsyt.Icon16" DefaultValue="https://finsyt.com/i.png"/>
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Finsyt.Taskpane" DefaultValue="https://finsyt.com/t.html"/>
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="Finsyt.OpenLabel" DefaultValue="Open"/>
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="Finsyt.OpenDesc" DefaultValue="Open desc"/>
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>`;

describe("validateManifestXml", () => {
  it("accepts a minimal well-formed manifest", () => {
    const r = validateManifestXml(minimalValid);
    assert.deepEqual(r.errors, []);
    assert.equal(r.ok, true);
  });

  it("flags a SourceLocation referencing an undefined Url resid", () => {
    const bad = minimalValid.replace(
      `<SourceLocation resid="Finsyt.Taskpane"/>`,
      `<SourceLocation resid="Finsyt.TaskpaneBuilder"/>`,
    );
    const r = validateManifestXml(bad);
    assert.equal(r.ok, false);
    assert.ok(
      r.errors.some((e) => e.includes("Finsyt.TaskpaneBuilder")),
      `expected error mentioning Finsyt.TaskpaneBuilder, got ${JSON.stringify(r.errors)}`,
    );
  });

  it("flags a Label referencing an undefined String resid", () => {
    const bad = minimalValid.replace(
      `<Label resid="Finsyt.OpenLabel"/>`,
      `<Label resid="Finsyt.MissingLabel"/>`,
    );
    const r = validateManifestXml(bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("Finsyt.MissingLabel")));
  });

  it("flags an Icon referencing an undefined Image resid", () => {
    const bad = minimalValid.replace(
      `<bt:Image size="16" resid="Finsyt.Icon16"/>`,
      `<bt:Image size="16" resid="Finsyt.MissingIcon"/>`,
    );
    const r = validateManifestXml(bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("Finsyt.MissingIcon")));
  });

  it("rejects a non-https Url in production mode", () => {
    const bad = minimalValid.replace(
      `DefaultValue="https://finsyt.com/t.html"`,
      `DefaultValue="http://example.com/t.html"`,
    );
    const r = validateManifestXml(bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.startsWith("Url DefaultValue must be https")));
  });

  it("allows http://localhost when allowHttp=true (dev manifest)", () => {
    const dev = minimalValid
      .replace(
        `DefaultValue="https://finsyt.com/t.html"`,
        `DefaultValue="http://localhost:8443/t.html"`,
      )
      .replace(
        `DefaultValue="https://finsyt.com/i.png"`,
        `DefaultValue="https://finsyt.com/i.png"`,
      );
    const r = validateManifestXml(dev, { allowHttp: true });
    assert.deepEqual(r.errors, []);
    assert.equal(r.ok, true);
  });

  it("flags duplicate TaskpaneIds across ribbon Controls", () => {
    const dup = minimalValid.replace(
      `<TaskpaneId>FinsytA</TaskpaneId>
                <SourceLocation resid="Finsyt.Taskpane"/>
              </Action>
            </Control>`,
      `<TaskpaneId>FinsytA</TaskpaneId>
                <SourceLocation resid="Finsyt.Taskpane"/>
              </Action>
            </Control>
            <Control>
              <Label resid="Finsyt.OpenLabel"/>
              <Supertip>
                <Title resid="Finsyt.OpenLabel"/>
                <Description resid="Finsyt.OpenDesc"/>
              </Supertip>
              <Icon><bt:Image size="16" resid="Finsyt.Icon16"/></Icon>
              <Action>
                <TaskpaneId>FinsytA</TaskpaneId>
                <SourceLocation resid="Finsyt.Taskpane"/>
              </Action>
            </Control>`,
    );
    const r = validateManifestXml(dup);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("duplicate TaskpaneId")));
  });

  it("flags missing required top-level elements", () => {
    const bad = minimalValid.replace(/<Id>[^<]+<\/Id>/, "");
    const r = validateManifestXml(bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("missing required element: <Id>")));
  });
});
