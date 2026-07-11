import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";

const outDir = join(process.cwd(), "out");
const inlineDir = join(outDir, "static", "inline");
const nextDir = join(outDir, "_next");
const safeNextDir = join(outDir, "next-assets");

function listHtmlFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...listHtmlFiles(path));
    } else if (entry.endsWith(".html")) {
      files.push(path);
    }
  }

  return files;
}

function safeName(filePath, index) {
  const relativePath = relative(outDir, filePath).replaceAll("/", "-").replace(/\.html$/, "");
  return `${relativePath || basename(filePath, ".html")}-${index}.js`;
}

mkdirSync(inlineDir, { recursive: true });

for (const htmlFile of listHtmlFiles(outDir)) {
  const html = readFileSync(htmlFile, "utf8");
  let scriptIndex = 0;

  const nextHtml = html.replace(
    /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g,
    (_match, attrs, code) => {
      if (!code.trim()) return _match;

      scriptIndex += 1;
      const fileName = safeName(htmlFile, scriptIndex);
      const scriptPath = join(inlineDir, fileName);
      const scriptSrc = `/${relative(outDir, scriptPath).replaceAll("\\", "/")}`;

      mkdirSync(dirname(scriptPath), { recursive: true });
      writeFileSync(scriptPath, code, "utf8");

      return `<script${attrs} src="${scriptSrc}"></script>`;
    }
  );

  if (scriptIndex > 0) {
    writeFileSync(htmlFile, nextHtml, "utf8");
  }
}

if (existsSync(nextDir)) {
  rmSync(safeNextDir, { recursive: true, force: true });
  renameSync(nextDir, safeNextDir);

  for (const htmlFile of listHtmlFiles(outDir)) {
    const html = readFileSync(htmlFile, "utf8");
    writeFileSync(htmlFile, html.replaceAll("/_next/", "/next-assets/"), "utf8");
  }
}

function listAllGeneratedFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...listAllGeneratedFiles(path));
    } else {
      files.push(path);
    }
  }

  return files;
}

function rewriteGeneratedTextFiles(replacements) {
  const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".txt"]);

  for (const file of listAllGeneratedFiles(outDir)) {
    if (!textExtensions.has(extname(file))) continue;

    let text = readFileSync(file, "utf8");
    let changed = false;

    for (const [from, to] of replacements) {
      if (text.includes(from)) {
        text = text.replaceAll(from, to);
        changed = true;
      }
    }

    if (changed) writeFileSync(file, text, "utf8");
  }
}

function removeChromeReservedGeneratedArtifacts() {
  for (const file of listAllGeneratedFiles(outDir)) {
    if (file.endsWith(".txt") || basename(file) === ".DS_Store") rmSync(file, { force: true });
  }

  rmSync(join(outDir, "_not-found"), { recursive: true, force: true });
  rmSync(join(outDir, "_metadata"), { recursive: true, force: true });
}

function renameChromeReservedGeneratedFiles() {
  const replacements = [];
  const files = listAllGeneratedFiles(outDir)
    .filter((file) => basename(file).startsWith("_"))
    .sort((a, b) => b.length - a.length);

  for (const file of files) {
    if (!existsSync(file)) continue;

    const oldName = basename(file);
    const newName = oldName.replace(/^_+/, "next-");
    const nextPath = join(dirname(file), newName);

    renameSync(file, nextPath);
    replacements.push([oldName, newName]);
  }

  rewriteGeneratedTextFiles(replacements);
}

removeChromeReservedGeneratedArtifacts();
renameChromeReservedGeneratedFiles();
