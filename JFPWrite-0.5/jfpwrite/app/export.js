/* JFPWrite - exportação para DOCX, EPUB e Markdown, sem nenhuma biblioteca externa. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var desktop = window.jfpDesktop || null;
  var PX_PER_CM = 96 / 2.54;
  var TWIP_PER_CM = 567;

  // ==================================================================
  // ZIP (formato dos arquivos .docx e .epub)
  // ==================================================================

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) { return new TextEncoder().encode(s); }

  function deflateRaw(bytes) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    var stream = new CompressionStream('deflate-raw');
    var writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(stream.readable).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  function le(value, size) {
    var out = [];
    for (var i = 0; i < size; i++) out.push((value >>> (8 * i)) & 0xFF);
    return out;
  }

  function concat(chunks) {
    var total = 0;
    chunks.forEach(function (c) { total += c.length; });
    var out = new Uint8Array(total);
    var pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  /** files: [{ name, data (texto ou bytes), store (true = sem compressão) }] */
  function zip(files) {
    var DOS_TIME = 0;
    var DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
    var chain = Promise.resolve({ chunks: [], central: [], offset: 0 });
    files.forEach(function (f) {
      chain = chain.then(function (state) {
        var data = typeof f.data === 'string' ? utf8(f.data) : f.data;
        var nameBytes = utf8(f.name);
        var crc = crc32(data);
        var pending = f.store || data.length < 64 ? Promise.resolve(null) : deflateRaw(data);
        return pending.then(function (comp) {
          var method = comp && comp.length < data.length ? 8 : 0;
          var body = method ? comp : data;
          var local = concat([
            new Uint8Array([0x50, 0x4b, 0x03, 0x04]), new Uint8Array(le(20, 2)), new Uint8Array(le(0x0800, 2)),
            new Uint8Array(le(method, 2)), new Uint8Array(le(DOS_TIME, 2)), new Uint8Array(le(DOS_DATE, 2)),
            new Uint8Array(le(crc, 4)), new Uint8Array(le(body.length, 4)), new Uint8Array(le(data.length, 4)),
            new Uint8Array(le(nameBytes.length, 2)), new Uint8Array(le(0, 2)), nameBytes, body
          ]);
          var central = concat([
            new Uint8Array([0x50, 0x4b, 0x01, 0x02]), new Uint8Array(le(20, 2)), new Uint8Array(le(20, 2)),
            new Uint8Array(le(0x0800, 2)), new Uint8Array(le(method, 2)), new Uint8Array(le(DOS_TIME, 2)),
            new Uint8Array(le(DOS_DATE, 2)), new Uint8Array(le(crc, 4)), new Uint8Array(le(body.length, 4)),
            new Uint8Array(le(data.length, 4)), new Uint8Array(le(nameBytes.length, 2)), new Uint8Array(le(0, 2)),
            new Uint8Array(le(0, 2)), new Uint8Array(le(0, 2)), new Uint8Array(le(0, 2)), new Uint8Array(le(0, 4)),
            new Uint8Array(le(state.offset, 4)), nameBytes
          ]);
          state.chunks.push(local);
          state.central.push(central);
          state.offset += local.length;
          return state;
        });
      });
    });
    return chain.then(function (state) {
      var centralBytes = concat(state.central);
      var end = concat([
        new Uint8Array([0x50, 0x4b, 0x05, 0x06]), new Uint8Array(le(0, 2)), new Uint8Array(le(0, 2)),
        new Uint8Array(le(files.length, 2)), new Uint8Array(le(files.length, 2)),
        new Uint8Array(le(centralBytes.length, 4)), new Uint8Array(le(state.offset, 4)), new Uint8Array(le(0, 2))
      ]);
      return concat(state.chunks.concat([centralBytes, end]));
    });
  }

  // ==================================================================
  // Utilidades comuns
  // ==================================================================

  function xml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function parseBody(html) {
    return new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
  }

  var NAMED = {
    black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', orange: 'FFA500',
    purple: '800080', gray: '808080', grey: '808080', pink: 'FFC0CB', brown: 'A52A2A', cyan: '00FFFF', magenta: 'FF00FF'
  };

  function hex2(n) { n = Math.max(0, Math.min(255, parseInt(n, 10) || 0)); return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }

  function cssColor(value) {
    if (!value) return null;
    var v = String(value).trim().toLowerCase();
    var m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (m) return hex2(m[1]) + hex2(m[2]) + hex2(m[3]);
    m = v.match(/^#([0-9a-f]{6})$/);
    if (m) return m[1].toUpperCase();
    m = v.match(/^#([0-9a-f]{3})$/);
    if (m) return (m[1][0] + m[1][0] + m[1][1] + m[1][1] + m[1][2] + m[1][2]).toUpperCase();
    return NAMED[v] || null;
  }

  function dataImage(src) {
    var m = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/i.exec(src || '');
    if (!m) return null;
    var type = m[1].toLowerCase();
    var ext = type === 'jpg' || type === 'jpeg' ? 'jpeg' : type;
    if (ext !== 'png' && ext !== 'jpeg' && ext !== 'gif') return null;
    var bin = atob(m[2]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ext: ext, bytes: bytes, size: imageSize(ext, bytes) };
  }

  function imageSize(ext, b) {
    try {
      if (ext === 'png') return { w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
      if (ext === 'gif') return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
      var i = 2;
      while (i < b.length) {
        if (b[i] !== 0xFF) { i++; continue; }
        var marker = b[i + 1];
        if ((marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
        }
        i += 2 + ((b[i + 2] << 8) | b[i + 3]);
      }
    } catch (e) { /* tamanho padrão */ }
    return { w: 400, h: 300 };
  }

  function pxOf(value) {
    var m = /^([\d.]+)(px|pt)?$/i.exec(String(value || '').trim());
    if (!m) return 0;
    var n = parseFloat(m[1]);
    return m[2] && m[2].toLowerCase() === 'pt' ? n * 96 / 72 : n;
  }

  function imageBox(el, img, maxPx) {
    var w = pxOf(el.getAttribute('width')) || pxOf(el.style.width);
    var h = pxOf(el.getAttribute('height')) || pxOf(el.style.height);
    var nat = img.size || { w: 400, h: 300 };
    if (!w && !h) { w = nat.w; h = nat.h; }
    else if (w && !h) h = w * nat.h / nat.w;
    else if (!w && h) w = h * nat.w / nat.h;
    if (w > maxPx) { h = h * maxPx / w; w = maxPx; }
    return { w: Math.max(8, Math.round(w)), h: Math.max(8, Math.round(h)) };
  }

  // ==================================================================
  // DOCX
  // ==================================================================

  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  var PAGE_SIZES = { A4: [21, 29.7], LETTER: [21.59, 27.94], A5: [14.8, 21] };

  function runProps(f) {
    var s = '';
    if (f.font) s += '<w:rFonts w:ascii="' + xml(f.font) + '" w:hAnsi="' + xml(f.font) + '" w:cs="' + xml(f.font) + '"/>';
    if (f.b) s += '<w:b/>';
    if (f.i) s += '<w:i/>';
    if (f.s) s += '<w:strike/>';
    if (f.color) s += '<w:color w:val="' + f.color + '"/>';
    if (f.size) s += '<w:sz w:val="' + f.size + '"/><w:szCs w:val="' + f.size + '"/>';
    if (f.u) s += '<w:u w:val="single"/>';
    if (f.bg) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + f.bg + '"/>';
    if (f.sup) s += '<w:vertAlign w:val="superscript"/>';
    if (f.sub) s += '<w:vertAlign w:val="subscript"/>';
    return s ? '<w:rPr>' + s + '</w:rPr>' : '';
  }

  function textRun(text, f) {
    if (!text) return '';
    var out = '';
    var parts = text.split(/(\t)/);
    parts.forEach(function (p) {
      if (p === '\t') out += '<w:r>' + runProps(f) + '<w:tab/></w:r>';
      else if (p) out += '<w:r>' + runProps(f) + '<w:t xml:space="preserve">' + xml(p) + '</w:t></w:r>';
    });
    return out;
  }

  function formatFrom(el, f) {
    var n = {};
    for (var k in f) n[k] = f[k];
    var tag = el.tagName;
    if (tag === 'B' || tag === 'STRONG') n.b = true;
    if (tag === 'I' || tag === 'EM' || tag === 'CITE') n.i = true;
    if (tag === 'U' || tag === 'INS') n.u = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') n.s = true;
    if (tag === 'SUP') n.sup = true;
    if (tag === 'SUB') n.sub = true;
    if (tag === 'FONT') {
      if (el.getAttribute('color')) n.color = cssColor(el.getAttribute('color')) || n.color;
      if (el.getAttribute('face')) n.font = el.getAttribute('face').split(',')[0].replace(/["']/g, '').trim();
    }
    var st = el.style;
    if (st) {
      if (st.fontWeight === 'bold' || parseInt(st.fontWeight, 10) >= 600) n.b = true;
      if (st.fontStyle === 'italic') n.i = true;
      var deco = st.textDecorationLine || st.textDecoration || '';
      if (/underline/.test(deco)) n.u = true;
      if (/line-through/.test(deco)) n.s = true;
      if (st.color) n.color = cssColor(st.color) || n.color;
      if (st.backgroundColor) n.bg = cssColor(st.backgroundColor) || n.bg;
      if (st.fontFamily) n.font = st.fontFamily.split(',')[0].replace(/["']/g, '').trim() || n.font;
      if (st.fontSize) {
        var px = pxOf(st.fontSize);
        if (px) n.size = Math.round(px * 0.75 * 2);
      }
    }
    return n;
  }

  function Docx(page) {
    this.page = page;
    var size = PAGE_SIZES[page.size] || PAGE_SIZES.A4;
    this.wCm = page.landscape ? size[1] : size[0];
    this.hCm = page.landscape ? size[0] : size[1];
    this.textTwips = Math.round((this.wCm - page.ml - page.mr) * TWIP_PER_CM);
    this.textPx = Math.round((this.wCm - page.ml - page.mr) * PX_PER_CM);
    this.media = [];
    this.links = [];
    this.nums = [];
    this.docPr = 0;
  }

  Docx.prototype.relLink = function (url) {
    var id = 'rIdL' + (this.links.length + 1);
    this.links.push({ id: id, url: url });
    return id;
  };

  Docx.prototype.drawing = function (el) {
    var img = dataImage(el.getAttribute('src'));
    if (!img) return textRun('[imagem não exportada]', {});
    var box = imageBox(el, img, this.textPx);
    var id = 'rIdI' + (this.media.length + 1);
    var name = 'image' + (this.media.length + 1) + '.' + (img.ext === 'jpeg' ? 'jpg' : img.ext);
    this.media.push({ id: id, name: name, bytes: img.bytes, ext: img.ext });
    var cx = box.w * 9525, cy = box.h * 9525;
    this.docPr++;
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="' + this.docPr + '" name="Imagem ' + this.docPr + '" descr="' + xml(el.getAttribute('alt') || '') + '"/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      '<pic:nvPicPr><pic:cNvPr id="' + this.docPr + '" name="' + name + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };

  Docx.prototype.inline = function (node, f) {
    var self = this;
    if (node.nodeType === 3) return textRun(node.nodeValue.replace(/ /g, ' ').replace(/[\r\n]+/g, ' '), f);
    if (node.nodeType !== 1) return '';
    var tag = node.tagName;
    if (tag === 'BR') return '<w:r><w:br/></w:r>';
    if (tag === 'IMG') return this.drawing(node);
    var nf = formatFrom(node, f);
    var kids = '';
    Array.prototype.forEach.call(node.childNodes, function (c) { kids += self.inline(c, tag === 'A' ? Object.assign({}, nf, { u: true, color: nf.color || '1746C7' }) : nf); });
    if (tag === 'A' && /^(https?:|mailto:)/i.test(node.getAttribute('href') || '')) {
      return '<w:hyperlink r:id="' + this.relLink(node.getAttribute('href')) + '">' + kids + '</w:hyperlink>';
    }
    return kids;
  };

  function alignOf(el) {
    var a = (el.style && el.style.textAlign) || el.getAttribute('align') || '';
    return { center: 'center', right: 'right', justify: 'both', left: 'left' }[a.toLowerCase()] || '';
  }

  Docx.prototype.para = function (el, opts) {
    opts = opts || {};
    var self = this;
    var runs = '';
    var f = opts.format || {};
    var nodes = opts.nodes || el.childNodes;
    Array.prototype.forEach.call(nodes, function (c) { runs += self.inline(c, f); });
    var ppr = '';
    if (opts.style) ppr += '<w:pStyle w:val="' + opts.style + '"/>';
    if (opts.num) ppr += '<w:numPr><w:ilvl w:val="' + opts.num.level + '"/><w:numId w:val="' + opts.num.id + '"/></w:numPr>';
    var left = opts.indent || 0;
    if (el && el.style && el.style.marginLeft) left += Math.round(pxOf(el.style.marginLeft) * 15);
    if (el && el.style && el.style.paddingLeft && !opts.num) left += Math.round(pxOf(el.style.paddingLeft) * 15);
    if (!opts.num && left) ppr += '<w:ind w:left="' + left + '"/>';
    var jc = el ? alignOf(el) : '';
    if (jc) ppr += '<w:jc w:val="' + jc + '"/>';
    return '<w:p>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + runs + '</w:p>';
  };

  var BLOCK = /^(P|H1|H2|H3|H4|H5|H6|UL|OL|LI|TABLE|BLOCKQUOTE|DIV|PRE|HR)$/;

  Docx.prototype.blocks = function (parent, ctx) {
    var self = this;
    var out = '';
    var pending = [];
    function flush() {
      if (!pending.length) return;
      var hasContent = pending.some(function (n) { return n.nodeType === 1 || /\S/.test(n.nodeValue); });
      if (hasContent) out += self.para(null, { nodes: pending, indent: ctx.indent, style: ctx.quote ? 'Quote' : null });
      pending = [];
    }
    Array.prototype.forEach.call(parent.childNodes, function (n) {
      if (n.nodeType === 1 && BLOCK.test(n.tagName)) { flush(); out += self.block(n, ctx); }
      else pending.push(n);
    });
    flush();
    return out;
  };

  Docx.prototype.block = function (el, ctx) {
    var tag = el.tagName;
    var style = null;
    if (tag === 'H1') style = 'Heading1';
    else if (tag === 'H2') style = 'Heading2';
    else if (tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') style = 'Heading3';
    if (/^H[1-6]$/.test(tag) || tag === 'P' || tag === 'PRE') {
      var hasBlock = Array.prototype.some.call(el.childNodes, function (c) { return c.nodeType === 1 && /^(UL|OL|TABLE|DIV|P)$/.test(c.tagName); });
      if (!hasBlock) {
        return this.para(el, { style: style || (ctx.quote ? 'Quote' : null), indent: ctx.indent, format: tag === 'PRE' ? { font: 'Consolas' } : {} });
      }
      return this.blocks(el, ctx);
    }
    if (tag === 'BLOCKQUOTE') return this.blocks(el, { indent: (ctx.indent || 0) + 720, quote: true });
    if (tag === 'UL' || tag === 'OL') return this.list(el, tag === 'OL', ctx.level || 0, ctx);
    if (tag === 'TABLE') return this.table(el);
    if (tag === 'HR') return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="9AA3B2"/></w:pBdr></w:pPr></w:p>';
    if (tag === 'DIV') {
      var inner = Array.prototype.some.call(el.childNodes, function (c) { return c.nodeType === 1 && BLOCK.test(c.tagName); });
      return inner ? this.blocks(el, ctx) : this.para(el, { indent: ctx.indent, style: ctx.quote ? 'Quote' : null });
    }
    if (tag === 'LI') return this.blocks(el, ctx);
    return '';
  };

  Docx.prototype.list = function (el, ordered, level, ctx) {
    var self = this;
    var numId = 1;
    if (ordered) {
      numId = 2 + this.nums.length;
      this.nums.push(numId);
    }
    var lvl = Math.min(level, 8);
    var out = '';
    Array.prototype.forEach.call(el.children, function (li) {
      if (li.tagName !== 'LI') return;
      var inlineNodes = [];
      var nested = '';
      var first = true;
      function flush() {
        if (!inlineNodes.length) return;
        if (inlineNodes.some(function (n) { return n.nodeType === 1 || /\S/.test(n.nodeValue); })) {
          out += self.para(null, { nodes: inlineNodes, num: first ? { id: numId, level: lvl } : null, indent: first ? 0 : 720 * (lvl + 1) });
          first = false;
        }
        inlineNodes = [];
      }
      Array.prototype.forEach.call(li.childNodes, function (c) {
        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) {
          flush();
          if (first) { out += self.para(null, { nodes: [], num: { id: numId, level: lvl } }); first = false; }
          out += self.list(c, c.tagName === 'OL', lvl + 1, ctx);
        } else if (c.nodeType === 1 && c.tagName === 'P') {
          flush();
          out += self.para(c, { num: first ? { id: numId, level: lvl } : null, indent: first ? 0 : 720 * (lvl + 1) });
          first = false;
        } else inlineNodes.push(c);
      });
      flush();
      if (first) out += self.para(null, { nodes: [], num: { id: numId, level: lvl } });
    });
    return out;
  };

  Docx.prototype.table = function (el) {
    var self = this;
    var rows = Array.prototype.slice.call(el.querySelectorAll('tr'));
    if (!rows.length) return '';
    var cols = 0;
    rows.forEach(function (r) {
      var n = 0;
      Array.prototype.forEach.call(r.children, function (c) { n += Math.max(1, parseInt(c.getAttribute('colspan'), 10) || 1); });
      cols = Math.max(cols, n);
    });
    var colW = Math.floor(this.textTwips / Math.max(1, cols));
    var grid = '';
    for (var g = 0; g < cols; g++) grid += '<w:gridCol w:w="' + colW + '"/>';
    var out = '<w:tbl><w:tblPr><w:tblW w:w="' + (colW * cols) + '" w:type="dxa"/><w:tblBorders>';
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].forEach(function (b) {
      out += '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="9AA3B2"/>';
    });
    out += '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>';
    out += '<w:tblGrid>' + grid + '</w:tblGrid>';
    rows.forEach(function (r) {
      out += '<w:tr>';
      Array.prototype.forEach.call(r.children, function (c) {
        var span = Math.max(1, parseInt(c.getAttribute('colspan'), 10) || 1);
        var th = c.tagName === 'TH';
        out += '<w:tc><w:tcPr><w:tcW w:w="' + (colW * span) + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
          (th ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2FB"/>' : '') + '</w:tcPr>';
        var inner = self.blocks(c, { indent: 0 });
        if (th) inner = inner.replace(/<w:r>(?!<w:drawing)/g, '<w:r><w:rPr><w:b/></w:rPr>').replace(/<w:rPr><w:b\/><\/w:rPr><w:rPr>/g, '<w:rPr><w:b/>');
        out += inner || '<w:p/>';
        out += '</w:tc>';
      });
      out += '</w:tr>';
    });
    return out + '</w:tbl><w:p/>';
  };

  Docx.prototype.sectPr = function (hasHeader, hasFooter) {
    var p = this.page;
    var out = '<w:sectPr>';
    if (hasHeader) out += '<w:headerReference w:type="default" r:id="rIdHdr"/>';
    if (hasFooter) out += '<w:footerReference w:type="default" r:id="rIdFtr"/>';
    out += '<w:pgSz w:w="' + Math.round(this.wCm * TWIP_PER_CM) + '" w:h="' + Math.round(this.hCm * TWIP_PER_CM) + '"' + (p.landscape ? ' w:orient="landscape"' : '') + '/>';
    out += '<w:pgMar w:top="' + Math.round(p.mt * TWIP_PER_CM) + '" w:right="' + Math.round(p.mr * TWIP_PER_CM) + '" w:bottom="' + Math.round(p.mb * TWIP_PER_CM) +
      '" w:left="' + Math.round(p.ml * TWIP_PER_CM) + '" w:header="' + Math.round(p.mt * TWIP_PER_CM / 2) + '" w:footer="' + Math.round(p.mb * TWIP_PER_CM / 2) + '" w:gutter="0"/>';
    return out + '</w:sectPr>';
  };

  function numberingXml(count) {
    var out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ' + NS + '>';
    var fmts = ['decimal', 'lowerLetter', 'lowerRoman'];
    out += '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>';
    for (var i = 0; i < 9; i++) {
      out += '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="' + (i % 2 ? 'o' : '•') + '"/><w:lvlJc w:val="left"/>' +
        '<w:pPr><w:ind w:left="' + (720 * (i + 1)) + '" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="default"/></w:rPr></w:lvl>';
    }
    out += '</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>';
    for (var j = 0; j < 9; j++) {
      out += '<w:lvl w:ilvl="' + j + '"><w:start w:val="1"/><w:numFmt w:val="' + fmts[j % 3] + '"/><w:lvlText w:val="%' + (j + 1) + '."/><w:lvlJc w:val="left"/>' +
        '<w:pPr><w:ind w:left="' + (720 * (j + 1)) + '" w:hanging="360"/></w:pPr></w:lvl>';
    }
    out += '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
    for (var n = 0; n < count; n++) {
      out += '<w:num w:numId="' + (2 + n) + '"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>';
    }
    return out + '</w:numbering>';
  }

  function stylesXml(page) {
    var line = Math.round((page.lh || 1.5) * 240);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '>' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:eastAsia="Georgia" w:cs="Georgia"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="pt-BR" w:eastAsia="pt-BR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="' + line + '" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="160" w:line="276" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="140" w:line="276" w:lineRule="auto"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="120" w:line="276" w:lineRule="auto"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="9AA3B2"/></w:pBdr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="5B6577"/></w:rPr></w:style>' +
      '</w:styles>';
  }

  function headerFooterXml(kind, page, textTwips) {
    var tag = kind === 'hdr' ? 'w:hdr' : 'w:ftr';
    var small = '<w:rPr><w:color w:val="6B7280"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>';
    var body;
    if (kind === 'hdr') {
      body = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>' + small + '<w:t xml:space="preserve">' + xml(page.header) + '</w:t></w:r></w:p>';
    } else {
      var field = '<w:r>' + small + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + small + '<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
        '<w:r>' + small + '<w:fldChar w:fldCharType="separate"/></w:r><w:r>' + small + '<w:t>1</w:t></w:r><w:r>' + small + '<w:fldChar w:fldCharType="end"/></w:r>';
      var pos = page.numbering === 'center' ? Math.round(textTwips / 2) : textTwips;
      var type = page.numbering === 'center' ? 'center' : 'right';
      var text = page.footer ? '<w:r>' + small + '<w:t xml:space="preserve">' + xml(page.footer) + '</w:t></w:r>' : '';
      var tabs = page.numbering === 'none' ? '' : '<w:tabs><w:tab w:val="' + type + '" w:pos="' + pos + '"/></w:tabs>';
      var mid = page.numbering === 'none' ? '' : '<w:r>' + small + '<w:tab/></w:r>' + field;
      body = '<w:p><w:pPr>' + tabs + '</w:pPr>' + text + mid + '</w:p>';
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><' + tag + ' ' + NS + '>' + body + '</' + tag + '>';
  }

  function toDocx(body, page, title) {
    var d = new Docx(page);
    var content = d.blocks(body, { indent: 0 });
    if (!content) content = '<w:p/>';
    var hasHeader = !!page.header;
    var hasFooter = !!page.footer || page.numbering !== 'none';
    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + content + d.sectPr(hasHeader, hasFooter) + '</w:body></w:document>';

    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>';
    if (hasHeader) rels += '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>';
    if (hasFooter) rels += '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>';
    d.media.forEach(function (m) {
      rels += '<Relationship Id="' + m.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>';
    });
    d.links.forEach(function (l) {
      rels += '<Relationship Id="' + l.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + xml(l.url) + '" TargetMode="External"/>';
    });
    rels += '</Relationships>';

    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      (hasHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '') +
      (hasFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';

    var root = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';

    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + xml(title) + '</dc:title><dc:creator>JFPWrite</dc:creator><dc:language>pt-BR</dc:language>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>';

    var files = [
      { name: '[Content_Types].xml', data: types },
      { name: '_rels/.rels', data: root },
      { name: 'docProps/core.xml', data: core },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/_rels/document.xml.rels', data: rels },
      { name: 'word/styles.xml', data: stylesXml(page) },
      { name: 'word/numbering.xml', data: numberingXml(d.nums.length) }
    ];
    if (hasHeader) files.push({ name: 'word/header1.xml', data: headerFooterXml('hdr', page, d.textTwips) });
    if (hasFooter) files.push({ name: 'word/footer1.xml', data: headerFooterXml('ftr', page, d.textTwips) });
    d.media.forEach(function (m) { files.push({ name: 'word/media/' + m.name, data: m.bytes, store: true }); });
    return zip(files);
  }

  // ==================================================================
  // EPUB
  // ==================================================================

  var XHTML_TAGS = { P: 'p', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h5', H6: 'h6', UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote',
    TABLE: 'table', THEAD: 'thead', TBODY: 'tbody', TR: 'tr', TD: 'td', TH: 'th', B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', SUP: 'sup', SUB: 'sub', PRE: 'pre', DIV: 'div' };

  function XhtmlWriter(images) { this.images = images; }

  XhtmlWriter.prototype.node = function (n) {
    var self = this;
    if (n.nodeType === 3) return xml(n.nodeValue.replace(/ /g, ' '));
    if (n.nodeType !== 1) return '';
    var tag = n.tagName;
    var kids = function () { var s = ''; Array.prototype.forEach.call(n.childNodes, function (c) { s += self.node(c); }); return s; };
    if (tag === 'BR') return '<br/>';
    if (tag === 'HR') return '<hr/>';
    if (tag === 'IMG') {
      var img = dataImage(n.getAttribute('src'));
      if (!img) return '';
      var name = 'images/img' + (this.images.length + 1) + '.' + (img.ext === 'jpeg' ? 'jpg' : img.ext);
      this.images.push({ name: name, bytes: img.bytes, mime: 'image/' + img.ext });
      return '<img src="' + name + '" alt="' + xml(n.getAttribute('alt') || '') + '"/>';
    }
    if (tag === 'A') {
      var href = n.getAttribute('href') || '';
      return /^(https?:|mailto:)/i.test(href) ? '<a href="' + xml(href) + '">' + kids() + '</a>' : kids();
    }
    var style = '';
    if (n.style) {
      if (n.style.textAlign) style += 'text-align:' + n.style.textAlign.replace(/[^a-z]/gi, '') + ';';
      var color = cssColor(n.style.color);
      if (color) style += 'color:#' + color + ';';
      var bg = cssColor(n.style.backgroundColor);
      if (bg) style += 'background-color:#' + bg + ';';
      var deco = n.style.textDecorationLine || n.style.textDecoration || '';
      if (/underline/.test(deco)) style += 'text-decoration:underline;';
      if (/line-through/.test(deco)) style += 'text-decoration:line-through;';
      if (n.style.fontWeight === 'bold' || parseInt(n.style.fontWeight, 10) >= 600) style += 'font-weight:bold;';
      if (n.style.fontStyle === 'italic') style += 'font-style:italic;';
    }
    var out = tag === 'U' || tag === 'INS' ? 'u' : tag === 'S' || tag === 'STRIKE' || tag === 'DEL' ? 's' : XHTML_TAGS[tag];
    if (out === 'u') { out = 'span'; style += 'text-decoration:underline;'; }
    if (out === 's') { out = 'span'; style += 'text-decoration:line-through;'; }
    if (!out) out = 'span';
    if (out === 'span' && !style) return kids();
    var attrs = style ? ' style="' + xml(style) + '"' : '';
    if ((out === 'td' || out === 'th') && n.getAttribute('colspan')) attrs += ' colspan="' + (parseInt(n.getAttribute('colspan'), 10) || 1) + '"';
    return '<' + out + attrs + '>' + kids() + '</' + out + '>';
  };

  var EPUB_CSS = 'body{font-family:Georgia,serif;line-height:1.5;margin:0 5%;}h1{font-size:1.6em;margin:1.2em 0 .6em;}h2{font-size:1.3em;}h3{font-size:1.1em;}' +
    'p{margin:0 0 .8em;text-align:justify;}blockquote{margin:1em 1.5em;font-style:italic;color:#555;border-left:3px solid #aaa;padding-left:1em;}' +
    'table{border-collapse:collapse;width:100%;}td,th{border:1px solid #999;padding:4px 6px;}img{max-width:100%;height:auto;}';

  function toEpub(body, title) {
    var images = [];
    var writer = new XhtmlWriter(images);
    var chapters = [];
    var current = null;
    var counter = 0;
    function start(titleText) {
      current = { title: titleText, html: '', subs: [] };
      chapters.push(current);
    }
    Array.prototype.forEach.call(body.childNodes, function (n) {
      if (n.nodeType === 3 && !/\S/.test(n.nodeValue)) return;
      if (n.nodeType === 1 && n.tagName === 'H1') start(n.textContent.trim() || 'Capítulo ' + (chapters.length + 1));
      if (!current) start(title);
      if (n.nodeType === 1 && n.tagName === 'H2') {
        counter++;
        var id = 's' + counter;
        current.subs.push({ id: id, title: n.textContent.trim() });
        var h2 = writer.node(n);
        current.html += h2.replace(/^<h2/, '<h2 id="' + id + '"');
        return;
      }
      if (n.nodeType === 3) current.html += '<p>' + writer.node(n) + '</p>';
      else current.html += writer.node(n);
    });
    if (!chapters.length) { start(title); current.html = '<p></p>'; }

    var uid = 'urn:uuid:' + (self.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    var files = [];
    files.push({ name: 'mimetype', data: 'application/epub+zip', store: true });
    files.push({ name: 'META-INF/container.xml', data: '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' });
    files.push({ name: 'OEBPS/style.css', data: EPUB_CSS });

    var manifest = '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>';
    var spine = '';
    var navItems = '';
    var ncx = '';
    chapters.forEach(function (c, i) {
      var file = 'chapter' + (i + 1) + '.xhtml';
      files.push({
        name: 'OEBPS/' + file,
        data: '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="pt-BR" lang="pt-BR"><head><meta charset="utf-8"/><title>' + xml(c.title) +
          '</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>' + c.html + '</body></html>'
      });
      manifest += '<item id="c' + (i + 1) + '" href="' + file + '" media-type="application/xhtml+xml"/>';
      spine += '<itemref idref="c' + (i + 1) + '"/>';
      var sub = c.subs.length ? '<ol>' + c.subs.map(function (s) { return '<li><a href="' + file + '#' + s.id + '">' + xml(s.title) + '</a></li>'; }).join('') + '</ol>' : '';
      navItems += '<li><a href="' + file + '">' + xml(c.title) + '</a>' + sub + '</li>';
      ncx += '<navPoint id="n' + (i + 1) + '" playOrder="' + (i + 1) + '"><navLabel><text>' + xml(c.title) + '</text></navLabel><content src="' + file + '"/></navPoint>';
    });
    images.forEach(function (im, i) {
      files.push({ name: 'OEBPS/' + im.name, data: im.bytes, store: true });
      manifest += '<item id="i' + (i + 1) + '" href="' + im.name + '" media-type="' + im.mime + '"/>';
    });
    files.push({
      name: 'OEBPS/nav.xhtml',
      data: '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="pt-BR" lang="pt-BR"><head><meta charset="utf-8"/><title>Sumário</title></head><body><nav epub:type="toc" id="toc"><h1>Sumário</h1><ol>' + navItems + '</ol></nav></body></html>'
    });
    files.push({
      name: 'OEBPS/toc.ncx',
      data: '<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="' + xml(uid) + '"/></head><docTitle><text>' + xml(title) + '</text></docTitle><navMap>' + ncx + '</navMap></ncx>'
    });
    files.push({
      name: 'OEBPS/content.opf',
      data: '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<dc:identifier id="bookid">' + xml(uid) + '</dc:identifier><dc:title>' + xml(title) + '</dc:title><dc:language>pt-BR</dc:language>' +
        '<meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</meta></metadata><manifest>' + manifest + '</manifest><spine toc="ncx">' + spine + '</spine></package>'
    });
    return zip(files);
  }

  // ==================================================================
  // Markdown
  // ==================================================================

  function mdEscape(t) {
    return t.replace(/\\/g, '\\\\').replace(/([*_`\[\]])/g, '\\$1');
  }

  function MdWriter() { this.images = []; }

  MdWriter.prototype.inline = function (n) {
    var self = this;
    if (n.nodeType === 3) return mdEscape(n.nodeValue.replace(/ /g, ' ').replace(/[\r\n]+/g, ' '));
    if (n.nodeType !== 1) return '';
    var tag = n.tagName;
    if (tag === 'BR') return '  \n';
    if (tag === 'IMG') {
      var img = dataImage(n.getAttribute('src'));
      if (!img) return '';
      var name = 'imagens/imagem' + (this.images.length + 1) + '.' + (img.ext === 'jpeg' ? 'jpg' : img.ext);
      this.images.push({ name: name, bytes: img.bytes });
      return '![' + mdEscape(n.getAttribute('alt') || 'imagem') + '](' + name + ')';
    }
    var kids = '';
    Array.prototype.forEach.call(n.childNodes, function (c) { kids += self.inline(c); });
    var bold = tag === 'B' || tag === 'STRONG' || (n.style && (n.style.fontWeight === 'bold' || parseInt(n.style.fontWeight, 10) >= 600));
    var ital = tag === 'I' || tag === 'EM' || (n.style && n.style.fontStyle === 'italic');
    var strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || (n.style && /line-through/.test(n.style.textDecorationLine || n.style.textDecoration || ''));
    var wrap = function (mark, s) {
      var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
      return m[2] ? m[1] + mark + m[2] + mark + m[3] : s;
    };
    if (tag === 'A' && /^(https?:|mailto:)/i.test(n.getAttribute('href') || '')) kids = '[' + kids + '](' + n.getAttribute('href') + ')';
    if (strike) kids = wrap('~~', kids);
    if (ital) kids = wrap('*', kids);
    if (bold) kids = wrap('**', kids);
    return kids;
  };

  var MD_BLOCK = /^(P|H1|H2|H3|H4|H5|H6|UL|OL|TABLE|BLOCKQUOTE|DIV|PRE|HR)$/;

  MdWriter.prototype.blocks = function (parent, indent) {
    var self = this;
    var out = [];
    var pending = [];
    function flush() {
      if (!pending.length) return;
      var text = pending.map(function (n) { return self.inline(n); }).join('').trim();
      if (text) out.push(indent + text);
      pending = [];
    }
    Array.prototype.forEach.call(parent.childNodes, function (n) {
      if (n.nodeType === 1 && MD_BLOCK.test(n.tagName)) { flush(); var b = self.block(n, indent); if (b) out.push(b); }
      else pending.push(n);
    });
    flush();
    return out.join('\n\n');
  };

  MdWriter.prototype.block = function (el, indent) {
    var self = this;
    var tag = el.tagName;
    var text = function () { var s = ''; Array.prototype.forEach.call(el.childNodes, function (c) { s += self.inline(c); }); return s.trim(); };
    if (/^H[1-6]$/.test(tag)) {
      var t = text();
      return t ? indent + '######'.slice(0, parseInt(tag.charAt(1), 10)) + ' ' + t : '';
    }
    if (tag === 'P') {
      var hasBlock = Array.prototype.some.call(el.childNodes, function (c) { return c.nodeType === 1 && /^(UL|OL|TABLE)$/.test(c.tagName); });
      if (hasBlock) return this.blocks(el, indent);
      var p = text();
      return p ? indent + p.replace(/^(#|>|[-+*]\s|\d+\.\s)/, '\\$1') : '';
    }
    if (tag === 'PRE') return indent + '```\n' + el.textContent.replace(/\n+$/, '') + '\n' + indent + '```';
    if (tag === 'HR') return indent + '---';
    if (tag === 'BLOCKQUOTE') {
      return this.blocks(el, '').split('\n').map(function (l) { return indent + '> ' + l; }).join('\n');
    }
    if (tag === 'UL' || tag === 'OL') return this.list(el, tag === 'OL', indent);
    if (tag === 'TABLE') return this.table(el, indent);
    if (tag === 'DIV') return this.blocks(el, indent);
    return '';
  };

  MdWriter.prototype.list = function (el, ordered, indent) {
    var self = this;
    var lines = [];
    var n = 0;
    Array.prototype.forEach.call(el.children, function (li) {
      if (li.tagName !== 'LI') return;
      n++;
      var marker = ordered ? n + '. ' : '- ';
      var inlineParts = [];
      var nested = [];
      Array.prototype.forEach.call(li.childNodes, function (c) {
        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(self.list(c, c.tagName === 'OL', indent + '    '));
        else if (c.nodeType === 1 && c.tagName === 'P') inlineParts.push(self.inline(c));
        else inlineParts.push(self.inline(c));
      });
      lines.push(indent + marker + inlineParts.join(' ').trim());
      nested.forEach(function (s) { if (s) lines.push(s); });
    });
    return lines.join('\n');
  };

  MdWriter.prototype.table = function (el, indent) {
    var self = this;
    var rows = Array.prototype.slice.call(el.querySelectorAll('tr')).map(function (r) {
      return Array.prototype.map.call(r.children, function (c) {
        var s = '';
        Array.prototype.forEach.call(c.childNodes, function (k) { s += self.inline(k); });
        return s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
      });
    });
    if (!rows.length) return '';
    var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    rows = rows.map(function (r) { while (r.length < cols) r.push(''); return r; });
    var line = function (r) { return indent + '| ' + r.join(' | ') + ' |'; };
    var sep = indent + '|' + new Array(cols + 1).join(' --- |');
    return [line(rows[0]), sep].concat(rows.slice(1).map(line)).join('\n');
  };

  function toMarkdown(body) {
    var w = new MdWriter();
    var text = w.blocks(body, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    if (!w.images.length) return Promise.resolve({ ext: 'md', bytes: utf8(text) });
    var files = [{ name: 'documento.md', data: text }];
    w.images.forEach(function (im) { files.push({ name: im.name, data: im.bytes, store: true }); });
    return zip(files).then(function (bytes) { return { ext: 'zip', bytes: bytes }; });
  }

  // ==================================================================
  // Interface
  // ==================================================================

  function docTitle() {
    var t = ($('docname').textContent || '').replace(/\s*[•*]\s*$/, '').replace(/\.jfpw$/i, '').trim();
    return t && !/^Documento sem t/i.test(t) ? t : '';
  }

  function currentBody() {
    var body = parseBody($('editor').innerHTML);
    var marked = body.querySelectorAll('.sel, .cur');
    for (var i = 0; i < marked.length; i++) { marked[i].classList.remove('sel'); marked[i].classList.remove('cur'); }
    return body;
  }

  function firstHeading(body) {
    var h = body.querySelector('h1, h2');
    return h ? h.textContent.trim() : '';
  }

  var hintTimer = null;
  function notify(text) {
    var el = $('hint');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { el.hidden = true; }, 4200);
  }

  function deliver(name, ext, bytes, kindName) {
    if (desktop && desktop.exportFile) {
      return desktop.exportFile({ suggestedName: name, ext: ext, filterName: kindName, data: bytes }).then(function (path) {
        if (path) notify('Exportado: ' + path);
      });
    }
    var blob = new Blob([bytes], { type: 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    notify('Arquivo ' + name + '.' + ext + ' gerado.');
    return Promise.resolve();
  }

  function run(kind) {
    var body = currentBody();
    var page = window.JFPPage ? window.JFPPage.get() : { size: 'A4', landscape: false, mt: 2.5, mb: 2.5, ml: 2.5, mr: 2.5, lh: 1.5, header: '', footer: '', numbering: 'none' };
    var named = docTitle();
    var title = named || firstHeading(body) || 'Documento';
    var fileBase = (named || title).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'Documento';
    if (kind === 'pdf') { if (window.JFPPage && window.JFPPage.print) window.JFPPage.print(); return Promise.resolve(); }
    var job;
    if (kind === 'docx') job = toDocx(body, page, title).then(function (b) { return { ext: 'docx', bytes: b, label: 'Documento do Word' }; });
    else if (kind === 'epub') job = toEpub(body, title).then(function (b) { return { ext: 'epub', bytes: b, label: 'Livro digital EPUB' }; });
    else job = toMarkdown(body).then(function (r) { return { ext: r.ext, bytes: r.bytes, label: r.ext === 'zip' ? 'Markdown com imagens (ZIP)' : 'Markdown' }; });
    return job.then(function (r) { return deliver(fileBase, r.ext, r.bytes, r.label); })
      .catch(function () { notify('Não foi possível exportar este documento.'); });
  }

  $('dlg-export').addEventListener('click', function (event) {
    var button = event.target.closest('button[data-export]');
    if (!button) return;
    $('dlg-export').close();
    run(button.getAttribute('data-export'));
  });

  $('topbar').addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (button && button.getAttribute('data-act') === 'export') $('dlg-export').showModal();
  });

  window.JFPExport = { toDocx: toDocx, toEpub: toEpub, toMarkdown: toMarkdown, parseBody: parseBody, zip: zip };
})();
