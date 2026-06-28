// ============================================================
// patch.js — Customizações visuais na lib @mmachadosantos/nfe-danfe-pdf
// Executado automaticamente via "postinstall" no package.json
// Idempotente: pode rodar múltiplas vezes sem problema
// ============================================================

const fs   = require('fs');
const path = require('path');

const BASE = path.join(
  __dirname,
  'node_modules/@mmachadosantos/nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe'
);

// Utilitário genérico de substituição com guard de idempotência
function patchFile(filename, oldStr, newStr, label) {
  const filePath = path.join(BASE, filename);
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(newStr)) {
    console.log(`  ⏭  ${label} — já aplicado`);
    return;
  }
  if (!content.includes(oldStr)) {
    console.warn(`  ⚠  ${label} — trecho original não encontrado`);
    return;
  }
  fs.writeFileSync(filePath, content.replace(oldStr, newStr), 'utf8');
  console.log(`  ✅ ${label}`);
}

console.log('\n🔧 Aplicando patches visuais na lib danfe-pdf...\n');

// ── 1. campo.js — remover negrito, fonte 8 ────────────────────────────────
patchFile('campo.js',
  `.font('negrito')\n        .fillColor(default_1.DEFAULT_NFE.corDoCampo)\n        .fontSize(tamanho ?? default_1.DEFAULT_NFE.tamanhoDaFonteDoCampo)`,
  `.font('normal')\n        .fillColor(default_1.DEFAULT_NFE.corDoCampo)\n        .fontSize(tamanho ?? 8)`,
  'campo.js — normal + fonte 8'
);

// ── 2. secao.js — remover negrito, fonte 6 ────────────────────────────────
patchFile('secao.js',
  `.font('negrito')\n        .fillColor(default_1.DEFAULT_NFE.corDaSecao)\n        .fontSize(tamanho ?? default_1.DEFAULT_NFE.tamanhoDaFonteDaSecao)`,
  `.font('normal')\n        .fillColor(default_1.DEFAULT_NFE.corDaSecao)\n        .fontSize(tamanho ?? 6)`,
  'secao.js — normal + fonte 6'
);

// ── 3. negrito.js — trocar para fonte normal ──────────────────────────────
patchFile('negrito.js',
  `.font('negrito')\n        .fillColor(default_1.DEFAULT_NFE.corDoTitulo)`,
  `.font('normal')\n        .fillColor(default_1.DEFAULT_NFE.corDoTitulo)`,
  'negrito.js — fonte normal'
);

// ── 4. get-dados-emitente.js — logo + texto emitente + chave ─────────────
const emitentePath = path.join(BASE, 'get-dados-emitente.js');
let em = fs.readFileSync(emitentePath, 'utf8');
let changed = false;

// 4a. Logo: substituir fit de qualquer tamanho por [90, 36]
const logoRegex = /(doc\.image\(pathLogo[\s\S]*?fit: )\[\d+, \d+\]/g;
if (logoRegex.test(em)) {
  em = em.replace(/(doc\.image\(pathLogo[\s\S]*?fit: )\[\d+, \d+\]/g, '$1[90, 36]');
  console.log('  ✅ get-dados-emitente.js — logo [90, 36]');
  changed = true;
} else if (em.includes('fit: [90, 36]')) {
  console.log('  ⏭  get-dados-emitente.js — logo já ajustada');
} else {
  console.warn('  ⚠  get-dados-emitente.js — fit logo não encontrado');
}

// 4b. Posição do texto do emitente quando há logo: x 67→75, largura 172→162
if (em.includes('? 67 :')) {
  em = em.replace('? 67 :', '? 75 :');
  em = em.replace('? 172 :', '? 162 :');
  console.log('  ✅ get-dados-emitente.js — posição texto emitente');
  changed = true;
} else {
  console.log('  ⏭  get-dados-emitente.js — posição texto já ajustada');
}

// 4c. Chave de acesso: campo() → negrito explícito
const oldChave = `    (0, campo_1.campo)({\n        value: (0, utils_1.formatKey)(protNFe.infProt.chNFe),\n        x: 341.5,\n        y: y + 67.7,\n        largura: 244,\n        ajusteX,\n        ajusteY,\n        doc,\n        margemEsquerda,\n        margemTopo\n    });`;
const newChave = `    // Chave de acesso — negrito explícito (única exceção)
    doc
        .font('negrito')
        .fillColor('black')
        .fontSize(7)
        .text((0, utils_1.formatKey)(protNFe.infProt.chNFe), margemEsquerda + ajusteX + 341.5, margemTopo + ajusteY + y + 67.7, {
        width: 244,
        align: 'center'
    });`;

if (em.includes(oldChave)) {
  em = em.replace(oldChave, newChave);
  console.log('  ✅ get-dados-emitente.js — chave de acesso em negrito');
  changed = true;
} else if (em.includes('// Chave de acesso — negrito explícito')) {
  console.log('  ⏭  get-dados-emitente.js — chave já em negrito');
} else {
  console.warn('  ⚠  get-dados-emitente.js — bloco chave não encontrado');
}

if (changed) fs.writeFileSync(emitentePath, em, 'utf8');

console.log('\n✅ Patches concluídos!\n');
