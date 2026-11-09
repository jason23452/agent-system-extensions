const EDITOR_STYLE = `
.xmind-editor{display:grid;grid-template-rows:auto auto auto minmax(0,1fr);height:100%;min-height:620px;gap:10px;padding:12px;background:#f7f5ef;color:#25231f;font:14px/1.45 ui-sans-serif,system-ui,sans-serif}
.xmind-editor *{box-sizing:border-box}.xmind-header{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #ded8cc;padding:0 2px 10px}.xmind-brand{display:flex;align-items:baseline;gap:9px}.xmind-brand strong{font:700 20px/1.1 Georgia,serif}.xmind-brand span{color:#756e63;font-size:12px}.xmind-actions{display:flex;gap:6px;flex-wrap:wrap}.xmind-button{border:1px solid #bdb4a5;border-radius:7px;background:#fffdf8;color:#25231f;cursor:pointer;font:600 12px/1.2 inherit;padding:7px 10px}.xmind-button:hover{background:#eee9df}.xmind-button.primary{border-color:#2f5d50;background:#2f5d50;color:#fff}.xmind-button:disabled{cursor:not-allowed;opacity:.45}.xmind-button:focus-visible,.xmind-input:focus-visible,.xmind-textarea:focus-visible,.xmind-select:focus-visible,.xmind-canvas:focus-visible{outline:3px solid #9bc8ba;outline-offset:2px}.xmind-form{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) auto;align-items:end;gap:8px}.xmind-field{display:grid;gap:4px;min-width:0}.xmind-field label{color:#756e63;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}.xmind-input,.xmind-select,.xmind-textarea{width:100%;border:1px solid #cfc7ba;border-radius:6px;background:#fffdf8;color:#25231f;padding:7px 8px;font:12px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace}.xmind-textarea{min-height:76px;resize:vertical}.xmind-form .xmind-button{height:32px}.xmind-status{min-height:31px;border:1px solid #ded8cc;border-radius:7px;background:#fffdf8;color:#756e63;padding:7px 9px;font-size:12px}.xmind-status[data-kind=error]{border-color:#c98981;background:#fff2ef;color:#8a3d36}.xmind-status[data-kind=success]{border-color:#a6c7b9;background:#effaf4;color:#2d6652}.xmind-workbench{display:grid;grid-template-columns:minmax(0,1fr) 230px;min-height:0;gap:10px}.xmind-canvas-pane{position:relative;min-width:0;min-height:0;overflow:hidden;border:1px solid #ded8cc;border-radius:9px;background:#fff}.xmind-canvas{display:block;width:100%;height:100%;min-height:520px;touch-action:none;cursor:grab}.xmind-canvas:active{cursor:grabbing}.xmind-canvas-bg{fill:#fff}.xmind-edge{fill:none;stroke-width:3;stroke-linecap:round;opacity:.8}.xmind-node{cursor:grab}.xmind-node:active{cursor:grabbing}.xmind-node rect{stroke:#fff;stroke-width:2;filter:drop-shadow(0 4px 5px rgba(43,38,31,.12))}.xmind-node text{fill:#1e2526;font-size:16px;font-weight:600;pointer-events:none;text-anchor:middle;dominant-baseline:middle}.xmind-node--root text{font-size:20px;font-weight:800}.xmind-node--selected rect{stroke:#202a2b;stroke-width:4}.xmind-canvas-toolbar{position:absolute;left:10px;top:10px;z-index:2;display:flex;gap:5px;border:1px solid #ded8cc;border-radius:8px;background:rgba(255,253,248,.92);padding:5px;box-shadow:0 3px 12px rgba(43,38,31,.1)}.xmind-canvas-toolbar .xmind-button{padding:5px 8px}.xmind-canvas-hint{position:absolute;right:12px;bottom:10px;z-index:2;border:1px solid #ded8cc;border-radius:7px;background:rgba(255,253,248,.9);padding:5px 8px;color:#756e63;font-size:11px}.xmind-inspector{display:grid;align-content:start;gap:10px;min-width:0;border:1px solid #ded8cc;border-radius:9px;background:#fffdf8;padding:11px;overflow:auto}.xmind-inspector h2{margin:0;font-size:13px}.xmind-inspector p{margin:0;color:#756e63;font-size:11px}.xmind-inspector-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}.xmind-empty{display:grid;place-items:center;height:100%;min-height:240px;color:#9a9185;text-align:center}.xmind-legend{display:flex;flex-wrap:wrap;gap:6px;color:#756e63;font-size:10px}.xmind-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;vertical-align:-1px;margin-right:3px}
@media (max-width:900px){.xmind-editor{min-height:700px}.xmind-workbench{grid-template-columns:1fr;grid-template-rows:minmax(430px,1fr) auto}.xmind-inspector{max-height:230px}.xmind-form{grid-template-columns:1fr 1fr}.xmind-form .xmind-button{width:100%}}
@media (max-width:600px){.xmind-editor{padding:8px}.xmind-header{align-items:flex-start;flex-direction:column}.xmind-actions{width:100%}.xmind-actions .xmind-button{flex:1}.xmind-form{grid-template-columns:1fr}.xmind-canvas{min-height:430px}}
`;

const PROFESSIONAL_STYLE = `
.xmind-editor{--xm-ink:#172033;--xm-muted:#687386;--xm-line:#dfe4ec;--xm-panel:#f5f7fa;--xm-blue:#2563eb;--xm-blue-dark:#1d4ed8;grid-template-rows:auto auto auto minmax(0,1fr);min-height:640px;gap:0;padding:0;overflow:hidden;border-radius:14px;background:var(--xm-panel);color:var(--xm-ink);font:14px/1.45 Inter,"Noto Sans TC","PingFang TC",system-ui,sans-serif}
.xmind-editor *{box-sizing:border-box}.xmind-header{min-height:64px;margin:0;padding:0 18px;border:0;border-bottom:1px solid var(--xm-line);background:rgba(255,255,255,.96);box-shadow:0 1px 0 rgba(15,23,42,.02)}
.xmind-brand{align-items:center;gap:10px}.xmind-brand-mark{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;background:linear-gradient(145deg,#111827,#334155);color:#fff;box-shadow:0 6px 14px rgba(15,23,42,.18)}.xmind-brand-mark svg{width:18px;height:18px}.xmind-brand-copy{display:grid;gap:1px}.xmind-brand strong{color:#111827;font:700 15px/1.2 Inter,"Noto Sans TC",system-ui,sans-serif;letter-spacing:-.01em}.xmind-brand span{color:var(--xm-muted);font-size:11px}
.xmind-actions{align-items:center;gap:7px}.xmind-button{min-height:34px;border:1px solid #d7dde7;border-radius:9px;background:#fff;color:#344054;font:600 12px/1 Inter,"Noto Sans TC",system-ui,sans-serif;padding:0 11px;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:border-color .15s ease,background .15s ease,box-shadow .15s ease,transform .15s ease}.xmind-button:hover{border-color:#b8c2d2;background:#f8fafc;box-shadow:0 3px 8px rgba(15,23,42,.08)}.xmind-button:active{transform:translateY(1px)}.xmind-button.primary{border-color:var(--xm-blue);background:var(--xm-blue);color:#fff;box-shadow:0 4px 10px rgba(37,99,235,.2)}.xmind-button.primary:hover{border-color:var(--xm-blue-dark);background:var(--xm-blue-dark)}.xmind-button.ai{border-color:#c7d7fe;background:linear-gradient(135deg,#eff6ff,#eef2ff);color:#1d4ed8}.xmind-button.ai:hover{border-color:#93b4fc;background:#e7efff}.xmind-button:disabled{box-shadow:none;transform:none}
.xmind-form{grid-template-columns:minmax(180px,1.35fr) minmax(150px,1fr) minmax(150px,1fr) auto;margin:0;padding:10px 14px;border-bottom:1px solid var(--xm-line);background:#fff;gap:9px}.xmind-field{gap:4px}.xmind-field label{color:#7b8494;font-size:9px;letter-spacing:.08em}.xmind-input,.xmind-select,.xmind-textarea{border-color:#d9dfe8;border-radius:8px;background:#f8fafc;color:#202939;font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;padding:7px 9px;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}.xmind-input:hover,.xmind-select:hover,.xmind-textarea:hover{border-color:#b8c2d2;background:#fff}.xmind-input:focus,.xmind-select:focus,.xmind-textarea:focus{border-color:#7aa2f7;background:#fff;box-shadow:0 0 0 3px rgba(37,99,235,.11)}
.xmind-status{min-height:34px;margin:0;padding:8px 15px;border:0;border-bottom:1px solid var(--xm-line);border-radius:0;background:#f8fafc;color:#667085;font-size:11px}.xmind-status:before{display:inline-block;width:6px;height:6px;margin-right:7px;border-radius:999px;background:#94a3b8;content:"";vertical-align:1px}.xmind-status[data-kind=error]{border-color:var(--xm-line);background:#fff5f5;color:#b42318}.xmind-status[data-kind=error]:before{background:#ef4444}.xmind-status[data-kind=success]{border-color:var(--xm-line);background:#f2fbf7;color:#067647}.xmind-status[data-kind=success]:before{background:#10b981}.xmind-status[data-kind=busy]{background:#eff6ff;color:#1d4ed8}.xmind-status[data-kind=busy]:before{background:#3b82f6;box-shadow:0 0 0 4px rgba(59,130,246,.12)}
.xmind-workbench{grid-template-columns:minmax(0,1fr) 286px;min-height:0;gap:12px;padding:12px;background:#eef1f5}.xmind-canvas-pane{border:1px solid #d9dee7;border-radius:12px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.06)}.xmind-canvas{min-height:520px;background:#fff}.xmind-canvas-bg{fill:url(#xmind-dot-grid)}.xmind-canvas-toolbar{top:12px;left:12px;gap:5px;padding:5px;border:1px solid rgba(209,216,227,.9);border-radius:11px;background:rgba(255,255,255,.94);box-shadow:0 8px 20px rgba(15,23,42,.09);backdrop-filter:blur(10px)}.xmind-canvas-toolbar .xmind-button{min-height:31px;border:0;background:transparent;box-shadow:none;padding:0 9px}.xmind-canvas-toolbar .xmind-button:hover{background:#f0f3f8}.xmind-canvas-toolbar .xmind-button.ai{background:#eaf1ff;color:#1d4ed8}.xmind-canvas-hint{right:14px;bottom:11px;left:auto;border:1px solid rgba(220,225,234,.9);border-radius:7px;background:rgba(255,255,255,.86);color:#8a94a6;padding:4px 7px;font-size:9px;backdrop-filter:blur(8px)}
.xmind-edge{fill:none;stroke-width:3;stroke-linecap:round;opacity:.72}.xmind-node{cursor:grab;filter:drop-shadow(0 3px 4px rgba(15,23,42,.11))}.xmind-node:active{cursor:grabbing}.xmind-node rect{stroke-width:1.5;transition:stroke-width .15s ease,filter .15s ease}.xmind-node text{font:650 15px/1 Inter,"Noto Sans TC",system-ui,sans-serif;pointer-events:none;text-anchor:middle;dominant-baseline:middle}.xmind-node--root text{font-size:18px;font-weight:750;letter-spacing:-.02em}.xmind-node--selected rect{stroke-width:3}.xmind-node--selected{filter:drop-shadow(0 5px 9px rgba(37,99,235,.2))}.xmind-node-add{cursor:pointer;filter:drop-shadow(0 2px 4px rgba(15,23,42,.15))}.xmind-node-add circle{fill:#fff;stroke:#4f83ef;stroke-width:2}.xmind-node-add text{fill:#2563eb;font:700 16px/1 system-ui,sans-serif;pointer-events:none;text-anchor:middle;dominant-baseline:central}.xmind-ai-badge circle{fill:#2563eb}.xmind-ai-badge text{fill:#fff;font:700 10px/1 system-ui,sans-serif;text-anchor:middle;dominant-baseline:central}
.xmind-inspector{gap:14px;padding:15px;border:1px solid #d9dee7;border-radius:12px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.05)}.xmind-inspector-header{display:flex;align-items:center;justify-content:space-between;gap:8px}.xmind-inspector h2{margin:0;color:#172033;font-size:13px;letter-spacing:-.01em}.xmind-selection-pill{max-width:150px;overflow:hidden;border-radius:999px;background:#f1f5f9;color:#64748b;padding:4px 8px;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.xmind-inspector .xmind-textarea{min-height:68px;resize:vertical}.xmind-inspector-actions{gap:6px}.xmind-inspector-actions .xmind-button{flex:1}.xmind-legend{border-top:1px solid #edf0f4;color:#8490a2}.xmind-legend i{border-radius:999px}
.xmind-ai-card{display:grid;gap:10px;margin-top:2px;padding:12px;border:1px solid #cbdafa;border-radius:11px;background:linear-gradient(145deg,#f8fbff,#f2f5ff);box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}.xmind-ai-heading{display:flex;align-items:center;gap:8px}.xmind-ai-icon{display:grid;width:28px;height:28px;flex:0 0 auto;place-items:center;border-radius:9px;background:linear-gradient(145deg,#2563eb,#4f46e5);color:#fff;box-shadow:0 5px 11px rgba(37,99,235,.2)}.xmind-ai-copy{display:grid;min-width:0;gap:1px}.xmind-ai-copy strong{color:#1e3a8a;font-size:12px}.xmind-ai-copy span{color:#6b7da5;font-size:9px}.xmind-ai-card .xmind-textarea{min-height:64px;background:rgba(255,255,255,.86);font-family:Inter,"Noto Sans TC",system-ui,sans-serif}.xmind-ai-controls{display:grid;grid-template-columns:78px minmax(0,1fr);gap:7px}.xmind-ai-controls .xmind-select{font-family:Inter,"Noto Sans TC",system-ui,sans-serif}.xmind-ai-controls .xmind-button{width:100%}.xmind-ai-state{min-height:15px;color:#60708f;font-size:9px;line-height:1.45}
@media (max-width:900px){.xmind-editor{min-height:760px}.xmind-header{align-items:flex-start;flex-direction:column;padding:12px 14px}.xmind-actions{width:100%;overflow-x:auto;padding-bottom:2px}.xmind-actions .xmind-button{flex:0 0 auto}.xmind-form{grid-template-columns:1fr 1fr}.xmind-workbench{grid-template-columns:1fr;grid-template-rows:minmax(470px,1fr) auto}.xmind-inspector{max-height:none}.xmind-canvas{min-height:470px}}
@media (max-width:600px){.xmind-editor{min-height:820px;border-radius:10px}.xmind-form{grid-template-columns:1fr}.xmind-workbench{padding:8px;gap:8px}.xmind-canvas-toolbar{max-width:calc(100% - 24px);overflow-x:auto}.xmind-canvas-hint{display:none}.xmind-canvas{min-height:450px}.xmind-ai-controls{grid-template-columns:1fr}}
`;

const PRODUCT_STYLE = `
.xmind-editor{grid-template-rows:58px minmax(0,1fr);height:100%;min-height:640px;border-radius:0;background:#eef1f4;overflow:hidden}
.xmind-header{min-height:58px;padding:0 16px;border-bottom:1px solid #d9dde3;background:#eef1f4;box-shadow:none}.xmind-product-nav{display:flex;min-width:0;align-items:center;gap:10px}.xmind-icon-button{display:grid;width:34px;height:34px;place-items:center;border:0;border-radius:9px;background:transparent;color:#536071;cursor:pointer}.xmind-icon-button:hover{background:#e2e7ed;color:#182230}.xmind-icon-button:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}.xmind-icon-button svg{width:18px;height:18px}.xmind-brand-mark{width:32px;height:32px;border-radius:9px}.xmind-brand-copy strong{font-size:14px}.xmind-brand-copy span{font-size:10px}.xmind-actions .xmind-button{background:#f8fafc}.xmind-actions .xmind-button.primary{background:#2563eb}
.xmind-workbench{grid-template-columns:410px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:0;padding:0;background:#eef1f4}.xmind-assistant{display:grid;min-width:0;min-height:0;grid-template-rows:minmax(0,1fr) auto;border-right:1px solid #d9dde3;background:#eef1f4}.xmind-assistant-scroll{min-height:0;overflow-y:auto;padding:38px 22px 18px}.xmind-assistant-intro{text-align:center}.xmind-assistant-logo{display:grid;width:48px;height:48px;margin:0 auto 14px;place-items:center;border:1px solid #e2d8ff;border-radius:50%;background:linear-gradient(145deg,#fff,#f1ebff);color:#8b5cf6;font-size:22px;box-shadow:0 8px 20px rgba(124,58,237,.09)}.xmind-assistant-intro h2{margin:0;color:#20242c;font-size:21px;letter-spacing:-.03em}.xmind-assistant-intro p{max-width:290px;margin:8px auto 0;color:#7b8492;font-size:11px;line-height:1.55}
.xmind-suggestions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:28px}.xmind-suggestions button{display:grid;min-height:78px;align-content:space-between;justify-items:start;gap:12px;border:1px solid #dde2e8;border-radius:13px;background:rgba(255,255,255,.86);color:#4b5565;cursor:pointer;padding:13px;text-align:left;font:500 12px/1.4 Inter,"Noto Sans TC",system-ui,sans-serif;box-shadow:0 2px 8px rgba(15,23,42,.025);transition:border-color .15s ease,background .15s ease,transform .15s ease}.xmind-suggestions button span{display:grid;width:25px;height:25px;place-items:center;border-radius:7px;background:#eceff3;color:#3f4a5a;font-size:13px}.xmind-suggestions button:hover{border-color:#bfc8d4;background:#fff;transform:translateY(-1px)}.xmind-suggestions button:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}
.xmind-node-panel,.xmind-file-settings{margin-top:14px;border:1px solid #dce1e8;border-radius:12px;background:rgba(255,255,255,.72);overflow:hidden}.xmind-node-panel>summary,.xmind-file-settings>summary{display:flex;min-height:40px;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;color:#4b5565;padding:0 12px;font-size:11px;font-weight:650;list-style:none}.xmind-node-panel>summary::-webkit-details-marker,.xmind-file-settings>summary::-webkit-details-marker{display:none}.xmind-node-panel[open]>summary,.xmind-file-settings[open]>summary{border-bottom:1px solid #e5e9ef}.xmind-node-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:11px}.xmind-node-fields .xmind-field:nth-child(1),.xmind-node-fields .xmind-field:nth-child(2),.xmind-node-fields .xmind-inspector-actions{grid-column:1/-1}.xmind-node-fields .xmind-textarea{min-height:54px}.xmind-selection-pill{max-width:180px;background:#eef1f4}.xmind-inspector-actions{display:grid;grid-template-columns:1fr 1fr 72px;gap:6px}.xmind-inspector-actions .xmind-button{padding:0 7px}.xmind-inspector-actions [data-action=delete-inspector]:not(:disabled){border-color:#fecaca;color:#b42318;background:#fff7f7}
.xmind-file-settings .xmind-form{display:grid;grid-template-columns:1fr;gap:8px;margin:0;padding:11px;border:0;background:transparent}.xmind-file-settings .xmind-form .xmind-button{width:100%}.xmind-field label,.xmind-ai-card .xmind-field>span{color:#7b8492;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
.xmind-assistant-composer{display:grid;gap:8px;padding:10px 14px 14px;background:linear-gradient(180deg,rgba(238,241,244,0),#eef1f4 16%)}.xmind-assistant-composer .xmind-status{min-height:24px;padding:4px 8px;border:0;background:transparent;font-size:9px}.xmind-ai-card{gap:8px;margin:0;padding:13px;border:1px solid #d9dee7;border-radius:17px;background:#fff;box-shadow:0 12px 30px rgba(15,23,42,.10)}.xmind-ai-heading{display:none}.xmind-ai-card .xmind-textarea{min-height:70px;border:0;background:#fff;padding:3px 2px;font-size:13px;line-height:1.5;resize:none;box-shadow:none}.xmind-ai-card .xmind-textarea:focus{box-shadow:none}.xmind-ai-controls{grid-template-columns:76px minmax(0,1fr);align-items:center}.xmind-ai-controls .xmind-button.ai{min-height:38px;border-color:#c4b5fd;background:linear-gradient(135deg,#8b5cf6,#a855f7);color:#fff;box-shadow:0 6px 14px rgba(139,92,246,.2)}.xmind-ai-state{margin:0;color:#8a93a1;font-size:9px}
.xmind-canvas-pane{order:2;min-height:0;border:0;border-radius:14px 0 0 14px;background:#fff;box-shadow:none}.xmind-canvas{min-height:0;background:#fff}.xmind-canvas-bg{fill:#fff}.xmind-canvas-toolbar{top:14px;left:50%;max-width:calc(100% - 28px);transform:translateX(-50%);white-space:nowrap}.xmind-canvas-hint{border-color:#e7e9ed;background:rgba(255,255,255,.9)}.xmind-edge{stroke-width:2.6;opacity:.86}.xmind-node{filter:none}.xmind-node rect{filter:drop-shadow(0 2px 3px rgba(15,23,42,.08));stroke-width:1}.xmind-node--selected rect{stroke-width:2.5}.xmind-node--root text{font-size:21px;font-weight:780}.xmind-node text{font-size:15px;font-weight:650}.xmind-node-add circle{fill:#fff;stroke:#3b82f6}.xmind-node-add text{fill:#2563eb}
@media (max-width:1100px){.xmind-workbench{grid-template-columns:340px minmax(0,1fr)}.xmind-assistant-scroll{padding:24px 14px 14px}.xmind-suggestions{gap:7px}.xmind-suggestions button{min-height:70px;padding:10px;font-size:11px}}
@media (max-width:760px){.xmind-editor{height:auto;min-height:100dvh;overflow:auto}.xmind-header{position:sticky;top:0;z-index:20;align-items:center;flex-direction:row;min-height:58px;padding:0 10px}.xmind-brand-copy span{display:none}.xmind-actions{justify-content:flex-end;overflow-x:auto}.xmind-actions .xmind-button{padding:0 8px}.xmind-workbench{grid-template-columns:1fr;grid-template-rows:auto minmax(520px,1fr)}.xmind-assistant{max-height:none;border-right:0;border-bottom:1px solid #d9dde3}.xmind-assistant-scroll{padding:22px 14px 12px}.xmind-assistant-intro p{display:none}.xmind-suggestions{margin-top:18px}.xmind-assistant-composer{position:static}.xmind-canvas-pane{min-height:520px;border-radius:0}.xmind-canvas{min-height:520px}.xmind-canvas-toolbar{overflow-x:auto}}
`;

const CHAT_STYLE = `
.xmind-breadcrumb{display:flex;min-width:0;align-items:center;gap:7px;color:#8a93a1;font-size:11px}.xmind-breadcrumb i{color:#b1b8c3;font-style:normal}.xmind-breadcrumb strong{max-width:min(32vw,360px);overflow:hidden;color:#273142;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.xmind-breadcrumb span{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xmind-assistant-scroll{display:flex;flex-direction:column}.xmind-assistant-intro{flex:0 0 auto}.xmind-chat-log{display:flex;min-height:80px;max-height:210px;flex-direction:column;gap:8px;margin-top:20px;overflow-y:auto;padding:2px}.xmind-chat-message{max-width:88%;margin:0;border-radius:13px;padding:9px 11px;font-size:11px;line-height:1.5;white-space:pre-wrap}.xmind-chat-message.agent{align-self:flex-start;border:1px solid #dde2e8;background:#fff;color:#4b5565}.xmind-chat-message.user{align-self:flex-end;background:#20242c;color:#fff}.xmind-chat-message.error{border-color:#fecaca;background:#fff5f5;color:#b42318}.xmind-suggestions{margin-top:16px}.xmind-file-settings{margin-top:auto}
.xmind-plan-card{display:grid;gap:9px;border:1px solid #d9dee7;border-radius:17px;background:#fff;padding:13px;box-shadow:0 12px 30px rgba(15,23,42,.10)}.xmind-plan-card .xmind-textarea{min-height:84px;border:0;background:#fff;padding:2px;font-size:13px;line-height:1.5;resize:none;box-shadow:none}.xmind-plan-card .xmind-textarea:focus{box-shadow:none}.xmind-plan-card .xmind-button.ai{min-height:40px;border-color:#8b5cf6;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;box-shadow:0 7px 16px rgba(124,58,237,.22)}.xmind-plan-state{margin:0;color:#8a93a1;font-size:9px}.xmind-assistant-composer{padding-top:8px}
.xmind-node-popover{position:absolute;z-index:15;width:min(330px,calc(100% - 20px));max-height:calc(100% - 20px);overflow-y:auto;border:1px solid #d6dce5;border-radius:15px;background:rgba(255,255,255,.97);box-shadow:0 18px 48px rgba(15,23,42,.18);backdrop-filter:blur(14px)}.xmind-node-popover[hidden]{display:none}.xmind-node-popover-header{display:grid;grid-template-columns:auto minmax(0,1fr) 26px;align-items:center;gap:8px;min-height:44px;border-bottom:1px solid #e7eaf0;padding:0 11px}.xmind-node-popover-header strong{font-size:11px}.xmind-node-popover-header .xmind-selection-pill{max-width:none;text-align:right}.xmind-node-popover-header button{display:grid;width:26px;height:26px;place-items:center;border:0;border-radius:7px;background:transparent;color:#7b8492;cursor:pointer;font-size:18px}.xmind-node-popover-header button:hover{background:#eef1f4;color:#1f2937}.xmind-node-popover .xmind-node-fields{grid-template-columns:1fr 1fr;padding:11px}.xmind-node-popover .xmind-node-fields .xmind-field:nth-child(1),.xmind-node-popover .xmind-node-fields .xmind-field:nth-child(2),.xmind-node-popover .xmind-inspector-actions{grid-column:1/-1}.xmind-node-popover .xmind-ai-card{display:grid;margin:0 10px 10px;border-color:#ddd6fe;border-radius:12px;background:#faf8ff;padding:11px;box-shadow:none}.xmind-node-popover .xmind-ai-heading{display:flex}.xmind-node-popover .xmind-ai-card .xmind-textarea{min-height:58px;border:1px solid #ddd6fe;background:#fff;padding:7px}.xmind-node-popover .xmind-ai-controls{grid-template-columns:72px minmax(0,1fr)}.xmind-node-popover .xmind-ai-controls .xmind-button.ai{min-height:34px}.xmind-node-popover .xmind-ai-state{font-size:9px}
@media (max-width:760px){.xmind-chat-log{max-height:140px}.xmind-node-popover{position:fixed;right:8px!important;bottom:8px!important;left:8px!important;top:auto!important;width:auto;max-height:65dvh}}
`;

const RESPONSIVE_STYLE = `
.xmind-editor{container:xmind-editor / inline-size;width:100%;max-width:100%;min-width:0}
.xmind-header,.xmind-product-nav,.xmind-actions,.xmind-workbench,.xmind-assistant,.xmind-canvas-pane{min-width:0}.xmind-product-nav{overflow:hidden}.xmind-actions{max-width:100%;scrollbar-width:none}.xmind-actions::-webkit-scrollbar,.xmind-canvas-toolbar::-webkit-scrollbar{display:none}.xmind-canvas{display:block;width:100%;height:100%;min-width:0;touch-action:none}.xmind-canvas-toolbar{max-width:calc(100% - 24px);overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}
@supports (container-type:inline-size){
  .xmind-editor{container-type:inline-size;container-name:xmind-editor}
  @container xmind-editor (max-width:1100px){
    .xmind-header{flex-wrap:wrap;row-gap:8px;padding-inline:14px}.xmind-product-nav{flex:1 1 260px}.xmind-actions{flex:0 1 auto}.xmind-workbench{grid-template-columns:minmax(280px,34%) minmax(0,1fr);gap:10px;padding:10px}.xmind-assistant-scroll{padding:24px 14px 14px}
  }
  @container xmind-editor (max-width:900px){
    .xmind-editor{height:auto;min-height:100dvh;overflow:auto}.xmind-header{position:sticky;top:0;z-index:20;align-items:center;padding:10px 12px}.xmind-workbench{grid-template-columns:1fr;grid-template-rows:auto minmax(520px,1fr);gap:0;padding:0}.xmind-assistant{border-right:0;border-bottom:1px solid #d9dde3}.xmind-assistant-scroll{padding:22px 14px 12px}.xmind-assistant-intro p{display:none}.xmind-suggestions{margin-top:18px}.xmind-canvas-pane{min-height:520px;border-radius:0}.xmind-canvas{min-height:520px}
  }
  @container xmind-editor (max-width:600px){
    .xmind-header{align-items:stretch;flex-direction:column;padding:8px}.xmind-product-nav{width:100%;min-height:44px}.xmind-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;overflow:visible}.xmind-actions .xmind-button{width:100%;min-width:0;min-height:42px;padding-inline:7px}.xmind-icon-button{width:44px;height:44px}.xmind-workbench{grid-template-rows:auto minmax(460px,1fr)}.xmind-canvas-pane,.xmind-canvas{min-height:460px}.xmind-canvas-toolbar{top:10px;right:10px;left:10px;max-width:none;justify-content:flex-start;transform:none}.xmind-canvas-hint{display:none}.xmind-suggestions{grid-template-columns:1fr}.xmind-node-fields,.xmind-node-popover .xmind-node-fields{grid-template-columns:1fr}.xmind-inspector-actions{grid-template-columns:1fr}.xmind-ai-controls,.xmind-node-popover .xmind-ai-controls{grid-template-columns:1fr}.xmind-node-popover{right:8px!important;bottom:8px!important;left:8px!important;top:auto!important;width:auto;max-height:75dvh}.xmind-node-popover-header button{width:40px;height:40px}
  }
}
@media (max-width:900px){
  .xmind-editor{height:auto;min-height:100dvh;overflow:auto}.xmind-header{flex-wrap:wrap;row-gap:8px;padding-inline:14px}.xmind-product-nav{flex:1 1 260px}.xmind-workbench{grid-template-columns:1fr;grid-template-rows:auto minmax(520px,1fr);gap:0;padding:0}.xmind-assistant{border-right:0;border-bottom:1px solid #d9dde3}.xmind-assistant-scroll{padding:22px 14px 12px}.xmind-assistant-intro p{display:none}.xmind-suggestions{margin-top:18px}.xmind-canvas-pane{min-height:520px;border-radius:0}.xmind-canvas{min-height:520px}
}
@media (max-width:600px){
  .xmind-header{align-items:stretch;flex-direction:column;padding:8px}.xmind-product-nav{width:100%;min-height:44px}.xmind-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;overflow:visible}.xmind-actions .xmind-button{width:100%;min-width:0;min-height:42px;padding-inline:7px}.xmind-icon-button{width:44px;height:44px}.xmind-workbench{grid-template-rows:auto minmax(460px,1fr)}.xmind-canvas-pane,.xmind-canvas{min-height:460px}.xmind-canvas-toolbar{top:10px;right:10px;left:10px;max-width:none;justify-content:flex-start;transform:none}.xmind-canvas-hint{display:none}.xmind-suggestions{grid-template-columns:1fr}.xmind-node-fields,.xmind-node-popover .xmind-node-fields{grid-template-columns:1fr}.xmind-inspector-actions{grid-template-columns:1fr}.xmind-ai-controls,.xmind-node-popover .xmind-ai-controls{grid-template-columns:1fr}.xmind-node-popover{right:8px!important;bottom:8px!important;left:8px!important;top:auto!important;width:auto;max-height:75dvh}.xmind-node-popover-header button{width:40px;height:40px}
}
`;

const NARROW_LAYOUT_STYLE = `
@media (max-width:900px){
  .xmind-editor{display:flex;flex-direction:column;height:auto;min-height:100dvh;overflow:auto}.xmind-header{flex:0 0 auto}.xmind-workbench{display:flex;flex:0 0 auto;flex-direction:column;gap:0;min-height:0}.xmind-assistant{display:flex;flex:0 0 auto;flex-direction:column;min-height:auto}.xmind-assistant-scroll{flex:0 0 auto;max-height:none;overflow:visible}.xmind-assistant-composer{flex:0 0 auto}.xmind-canvas-pane{flex:0 0 520px}
}
@media (max-width:600px){
  .xmind-product-nav{flex:0 0 auto}.xmind-canvas-pane{flex-basis:460px}.xmind-canvas{min-height:460px}
}
@supports (container-type:inline-size){
  @container xmind-editor (max-width:900px){
    .xmind-editor{display:flex;flex-direction:column;height:auto;min-height:100dvh;overflow:auto}.xmind-header{flex:0 0 auto}.xmind-workbench{display:flex;flex:0 0 auto;flex-direction:column;gap:0;min-height:0}.xmind-assistant{display:flex;flex:0 0 auto;flex-direction:column;min-height:auto}.xmind-assistant-scroll{flex:0 0 auto;max-height:none;overflow:visible}.xmind-assistant-composer{flex:0 0 auto}.xmind-canvas-pane{flex:0 0 520px}
  }
  @container xmind-editor (max-width:600px){
    .xmind-product-nav{flex:0 0 auto}.xmind-canvas-pane{flex-basis:460px}.xmind-canvas{min-height:460px}
  }
}
`;

const BRANCH_THEMES = [
  { fill: "#ff686f", stroke: "#ff5a62", text: "#231f20" },
  { fill: "#ff9b62", stroke: "#ff8c4d", text: "#231f20" },
  { fill: "#8fd1b1", stroke: "#78c4a1", text: "#17211d" },
  { fill: "#7edbd2", stroke: "#63cdc3", text: "#17211d" },
  { fill: "#62c5ed", stroke: "#47b6e2", text: "#17212a" },
  { fill: "#d77be7", stroke: "#ca66dd", text: "#241728" },
];

export async function activate(host) {
  return {
    extensionId: "xmind",
    version: "1.0.5",
    capabilities: ["xmind-import", "xmind-editor", "xmind-export", "markdown-editor", "markdown-export"],
    contextAction: {
      mount(container, context) {
        return mountContextAction(container, context);
      },
    },
    editor: {
      mount(container, context) {
        return mountEditor(host, container, context);
      },
    },
    attachments: {
      async prepare(file) {
        if (!file?.name?.toLowerCase().endsWith(".xmind")) return undefined;
        const map = await parseXMind(new Uint8Array(await file.arrayBuffer()), file.name);
        const markdownPath = file.name.replace(/\.xmind$/i, ".md");
        await host.api.writeProjectFile({ content: serializeMarkdown(map), path: markdownPath });
        return { meta: "XMind 已轉成 Markdown", name: markdownPath, path: markdownPath };
      },
    },
  };
}

function mountContextAction(container, context) {
  const style = document.createElement("style");
  style.textContent = ".xmind-context-action-button{display:inline-flex;width:32px;height:32px;align-items:center;justify-content:center;border:1px solid var(--input);border-radius:8px;background:var(--background);color:var(--foreground);cursor:pointer;transition:background .15s ease,color .15s ease}.xmind-context-action-button:hover{background:var(--accent);color:var(--accent-foreground)}.xmind-context-action-button:focus-visible{outline:2px solid var(--ring);outline-offset:2px}.xmind-context-action-button svg{width:16px;height:16px}.xmind-context-action-button:disabled{cursor:not-allowed;opacity:.5}";
  const button = document.createElement("button");
  button.className = "xmind-context-action-button";
  button.type = "button";
  button.setAttribute("aria-label", "開啟 XMind editor");
  button.title = "開啟 XMind editor";
  button.innerHTML = '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><line x1="6" x2="6" y1="3" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>';
  const openEditor = () => context.openEditor();
  button.addEventListener("click", openEditor);
  container.replaceChildren(style, button);
  return {
    destroy() {
      button.removeEventListener("click", openEditor);
      container.replaceChildren();
    },
  };
}

function mountEditor(host, container, context) {
  const style = document.createElement("style");
  style.textContent = EDITOR_STYLE + PROFESSIONAL_STYLE + PRODUCT_STYLE + CHAT_STYLE + RESPONSIVE_STYLE + NARROW_LAYOUT_STYLE;
  const root = document.createElement("section");
  root.className = "xmind-editor";
  root.setAttribute("aria-label", "XMind editor");
  root.innerHTML = `
    <header class="xmind-header">
      <div class="xmind-product-nav">
        <button class="xmind-icon-button" data-action="back" type="button" aria-label="返回 Project"><svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path></svg></button>
        <span class="xmind-brand-mark" aria-hidden="true"><svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="6" r="2.5"></circle><circle cx="18" cy="18" r="2.5"></circle><path d="M8.5 11c3-1 4.2-3.2 7-4.2M8.5 13c3 1 4.2 3.2 7 4.2"></path></svg></span>
        <nav class="xmind-breadcrumb" aria-label="XMind 檔案路徑"><span>${escapeHtml(context?.projectName || "Project")}</span><i aria-hidden="true">/</i><strong data-role="current-file">mindmap.xmind</strong></nav>
      </div>
      <div class="xmind-actions">
        <button class="xmind-button" data-action="new" type="button">新建</button>
        <button class="xmind-button" data-action="load" type="button">開啟</button>
        <button class="xmind-button" data-action="download-xmind" type="button">下載 XMind</button>
        <button class="xmind-button primary" data-action="save-xmind" type="button">儲存 XMind</button>
        <button class="xmind-button" data-action="save-as-xmind" type="button">另存 XMind</button>
      </div>
    </header>
    <input data-field="source" id="xmind-source" type="hidden" value="mindmap.xmind" />
    <input data-field="md-output" id="xmind-md-output" type="hidden" value="mindmap.md" />
    <input data-field="xmind-output" id="xmind-xmind-output" type="hidden" value="mindmap.xmind" />
    <div class="xmind-workbench">
      <aside class="xmind-assistant" aria-label="AI 心智圖助手">
        <div class="xmind-assistant-scroll">
          <section class="xmind-assistant-intro">
            <span class="xmind-assistant-logo" aria-hidden="true">✦</span>
            <h2>規劃一張新的心智圖</h2>
            <p>描述整體需求，AI 會建立中心主題與多層規劃節點。</p>
          </section>
          <div class="xmind-chat-log" data-role="plan-log" aria-live="polite">
            <p class="xmind-chat-message agent">告訴我你想規劃的主題，我會先產生完整架構，再放到右側畫布。</p>
          </div>
        </div>
        <div class="xmind-assistant-composer">
          <div class="xmind-status" data-role="status" role="status" aria-live="polite">Project: ${escapeHtml(context?.projectName || "current project")}。</div>
          <section class="xmind-plan-card" aria-label="AI 整體規劃">
            <label class="xmind-field" for="xmind-plan-prompt"><span>輸入整體需求...</span><textarea class="xmind-textarea" data-field="plan-prompt" id="xmind-plan-prompt" placeholder="例如：規劃一個街舞社團年度活動，包含招生、訓練、賽事與成果展"></textarea></label>
            <button class="xmind-button ai" data-action="plan-generate" type="button">✦ 產生完整心智圖</button>
            <p class="xmind-plan-state" data-role="plan-state" aria-live="polite">由 xmind-plan-agent 建立多層規劃。</p>
          </section>
        </div>
      </aside>
      <section class="xmind-canvas-pane" aria-label="XMind 心智圖畫布">
        <div class="xmind-canvas-toolbar" role="toolbar" aria-label="XMind 畫布工具">
          <button class="xmind-button" data-action="add-child" type="button">+ 子節點</button>
          <button class="xmind-button" data-action="add-sibling" type="button">+ 同層</button>
          <button class="xmind-button" data-action="delete" type="button">刪除</button>
          <button class="xmind-button" data-action="zoom-out" type="button" aria-label="縮小">−</button>
          <button class="xmind-button" data-action="zoom-in" type="button" aria-label="放大">+</button>
          <button class="xmind-button" data-action="fit" type="button">適合畫布</button>
        </div>
        <svg class="xmind-canvas" data-role="canvas" role="application" aria-label="XMind mind map canvas" tabindex="0" viewBox="0 0 1600 900">
          <defs>
            <pattern height="28" id="xmind-dot-grid" patternUnits="userSpaceOnUse" width="28"><circle cx="1" cy="1" fill="#d9e0ea" r="1"></circle></pattern>
          </defs>
          <rect class="xmind-canvas-bg" data-role="canvas-bg" height="900" width="1600" x="0" y="0" />
          <g data-role="viewport"></g>
        </svg>
        <aside class="xmind-node-popover" data-role="node-popover" aria-label="目前節點設定" hidden>
          <div class="xmind-node-popover-header"><strong>目前節點</strong><span class="xmind-selection-pill" data-role="selection">尚未選取節點</span><button aria-label="關閉節點設定" data-action="deselect" type="button">×</button></div>
          <div class="xmind-node-fields">
            <div class="xmind-field"><label for="xmind-title">標題</label><input class="xmind-input" data-field="title" id="xmind-title" disabled /></div>
            <div class="xmind-field"><label for="xmind-note">備註</label><textarea class="xmind-textarea" data-field="note" id="xmind-note" disabled></textarea></div>
            <div class="xmind-field"><label for="xmind-link">連結</label><input class="xmind-input" data-field="link" id="xmind-link" disabled /></div>
            <div class="xmind-field"><label for="xmind-status">狀態</label><select class="xmind-select" data-field="task" id="xmind-status" disabled><option value="">未設定</option><option value="todo">待辦</option><option value="doing">進行中</option><option value="done">完成</option></select></div>
            <div class="xmind-inspector-actions"><button class="xmind-button" data-action="add-child-inspector" disabled type="button">新增子節點</button><button class="xmind-button" data-action="add-sibling-inspector" disabled type="button">新增同層</button><button class="xmind-button" data-action="delete-inspector" disabled type="button">刪除</button></div>
          </div>
          <section class="xmind-ai-card" aria-label="AI 節點延伸">
            <div class="xmind-ai-heading"><span class="xmind-ai-icon" aria-hidden="true">✦</span><span class="xmind-ai-copy"><strong>延伸目前節點</strong><span>xmind-node-agent</span></span></div>
            <label class="xmind-field" for="xmind-ai-prompt"><span>延伸方向</span><textarea class="xmind-textarea" data-field="ai-prompt" id="xmind-ai-prompt" placeholder="例如：補上執行步驟與風險"></textarea></label>
            <div class="xmind-ai-controls"><select aria-label="生成節點數" class="xmind-select" data-field="ai-count"><option value="3">3 個</option><option selected value="4">4 個</option><option value="5">5 個</option><option value="6">6 個</option></select><button class="xmind-button ai" data-action="ai-expand" disabled type="button">✦ AI 延伸</button></div>
            <p class="xmind-ai-state" data-role="ai-state" aria-live="polite">將從目前節點建立下一層分支。</p>
          </section>
        </aside>
        <div class="xmind-canvas-hint">拖曳節點移動 · 滾輪縮放 · 空白處拖曳平移</div>
      </section>
    </div>
  `;
  container.replaceChildren(style, root);

  const sourceInput = root.querySelector('[data-field="source"]');
  const markdownOutputInput = root.querySelector('[data-field="md-output"]');
  const xmindOutputInput = root.querySelector('[data-field="xmind-output"]');
  const titleInput = root.querySelector('[data-field="title"]');
  const noteInput = root.querySelector('[data-field="note"]');
  const linkInput = root.querySelector('[data-field="link"]');
  const taskInput = root.querySelector('[data-field="task"]');
  const canvas = root.querySelector('[data-role="canvas"]');
  const canvasPane = root.querySelector('.xmind-canvas-pane');
  const viewport = root.querySelector('[data-role="viewport"]');
  const status = root.querySelector('[data-role="status"]');
  const currentFileLabel = root.querySelector('[data-role="current-file"]');
  const selectionLabel = root.querySelector('[data-role="selection"]');
  const aiPromptInput = root.querySelector('[data-field="ai-prompt"]');
  const aiCountInput = root.querySelector('[data-field="ai-count"]');
  const aiState = root.querySelector('[data-role="ai-state"]');
  const aiButtons = root.querySelectorAll('[data-action^="ai-expand"]');
  const planPromptInput = root.querySelector('[data-field="plan-prompt"]');
  const planButton = root.querySelector('[data-action="plan-generate"]');
  const planState = root.querySelector('[data-role="plan-state"]');
  const planLog = root.querySelector('[data-role="plan-log"]');
  const planPresetButtons = root.querySelectorAll('[data-plan-prompt]');
  const nodePopover = root.querySelector('[data-role="node-popover"]');
  const backButton = root.querySelector('[data-action="back"]');
  const deleteInspectorButton = root.querySelector('[data-action="delete-inspector"]');
  const inspectorButtons = root.querySelectorAll('[data-action$="-inspector"]');
  let map = newDocument();
  let selectedID = null;
  let nodePopoverOpen = false;
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let drag = null;
  let lastNodeClick = { id: null, time: 0 };
  let disposed = false;
  let aiLoading = false;
  let planLoading = false;
  let mdOutputTouched = false;
  let xmindOutputTouched = false;

  const setStatus = (message, kind = "") => {
    if (disposed) return;
    status.textContent = message;
    status.dataset.kind = kind;
    host.ui.announce(message);
  };

  const updateCurrentFile = (path) => {
    const filename = String(path || "mindmap.xmind").replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || "mindmap.xmind";
    currentFileLabel.textContent = filename;
    currentFileLabel.title = String(path || filename);
  };

  const selectedNode = () => findNode(map.roots, selectedID);

  const render = () => {
    ensureLayout(map);
    renderCanvas();
    syncInspector();
  };

  const renderCanvas = () => {
    viewport.replaceChildren();
    const all = flatten(map.roots);
    const positions = new Map(all.map((node) => [node.id, node.position]));
    const edgeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const nodeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    edgeLayer.setAttribute("aria-hidden", "true");
    all.forEach((node) => {
      node.children.forEach((child) => {
        const start = positions.get(node.id);
        const end = positions.get(child.id);
        if (!start || !end) return;
        const direction = end.x >= start.x ? 1 : -1;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const bend = Math.max(70, Math.abs(end.x - start.x) * 0.45);
        path.setAttribute("class", "xmind-edge");
        path.setAttribute("d", `M ${start.x} ${start.y} C ${start.x + bend * direction} ${start.y}, ${end.x - bend * direction} ${end.y}, ${end.x} ${end.y}`);
        path.setAttribute("stroke", branchTheme(child).stroke);
        edgeLayer.append(path);
      });
    });
    all.forEach((node) => {
      const point = positions.get(node.id);
      if (!point) return;
      const isRoot = map.roots.includes(node);
      const theme = branchTheme(node);
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const width = nodeWidth(node, isRoot);
      const height = isRoot ? 64 : 46;
      group.setAttribute("class", `xmind-node ${isRoot ? "xmind-node--root" : ""} ${node.id === selectedID ? "xmind-node--selected" : ""}`);
      group.setAttribute("data-node-id", node.id);
      group.setAttribute("transform", `translate(${point.x - width / 2} ${point.y - height / 2})`);
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `${node.title} 節點`);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(height));
      rect.setAttribute("rx", isRoot ? "16" : "10");
      rect.style.fill = isRoot ? "#ffffff" : theme.fill;
      rect.style.stroke = node.id === selectedID ? "#20a8f5" : isRoot ? "#d8dde5" : theme.stroke;
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(width / 2));
      text.setAttribute("y", String(height / 2));
      text.style.fill = isRoot ? "#111827" : theme.text;
      text.textContent = node.title.length > 24 ? `${node.title.slice(0, 23)}…` : node.title;
      group.append(rect, text);
      if (node.generatedBy === "xmind-node-agent") {
        const badge = document.createElementNS("http://www.w3.org/2000/svg", "g");
        badge.setAttribute("class", "xmind-ai-badge");
        badge.setAttribute("transform", `translate(${width - 4} 4)`);
        const badgeCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        badgeCircle.setAttribute("r", "9");
        const badgeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        badgeText.textContent = "✦";
        badge.append(badgeCircle, badgeText);
        group.append(badge);
      }
      if (node.id === selectedID) {
        const rootX = map.roots[0]?.position?.x ?? 800;
        const quickAdd = document.createElementNS("http://www.w3.org/2000/svg", "g");
        quickAdd.setAttribute("aria-label", `在 ${node.title} 下新增子節點`);
        quickAdd.setAttribute("class", "xmind-node-add");
        quickAdd.setAttribute("role", "button");
        quickAdd.setAttribute("tabindex", "0");
        quickAdd.setAttribute("transform", `translate(${isRoot || point.x >= rootX ? width + 14 : -14} ${height / 2})`);
        const addCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        addCircle.setAttribute("r", "11");
        const addText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        addText.textContent = "+";
        quickAdd.append(addCircle, addText);
        quickAdd.addEventListener("pointerdown", (event) => event.stopPropagation());
        quickAdd.addEventListener("click", (event) => { event.stopPropagation(); addChild(); });
        quickAdd.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); addChild(); } });
        group.append(quickAdd);
      }
      group.addEventListener("click", (event) => event.stopPropagation());
      group.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); });
      group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(node.id, true); titleInput.focus(); titleInput.select(); } });
      group.addEventListener("pointerdown", (event) => startDrag(event, node, group));
      nodeLayer.append(group);
    });
    viewport.append(edgeLayer, nodeLayer);
    applyViewportTransform();
  };

  const syncInspector = () => {
    const node = selectedNode();
    const disabled = !node;
    nodePopover.hidden = disabled || !nodePopoverOpen;
    selectionLabel.textContent = node ? `${node.title} · ${node.id}` : "尚未選取節點";
    titleInput.disabled = disabled;
    noteInput.disabled = disabled;
    linkInput.disabled = disabled;
    taskInput.disabled = disabled;
    inspectorButtons.forEach((button) => { button.disabled = disabled; });
    deleteInspectorButton.disabled = disabled || (node ? map.roots.includes(node) : true);
    aiButtons.forEach((button) => {
      button.disabled = disabled || aiLoading;
      button.textContent = aiLoading ? "正在延伸..." : "✦ AI 延伸";
    });
    if (!node) return;
    titleInput.value = node.title;
    noteInput.value = node.note || "";
    linkInput.value = node.hyperlink || "";
    taskInput.value = node.taskStatus || "";
    positionNodePopover();
  };

  const selectNode = (id, openPopover = false) => {
    selectedID = id;
    nodePopoverOpen = openPopover;
    render();
    const node = selectedNode();
    if (node && !aiLoading) aiState.textContent = `將從「${node.title}」建立下一層分支。`;
  };

  const mutate = (callback) => { callback(); render(); };

  const addChild = () => {
    const parent = selectedNode() || map.roots[0];
    if (!parent) return;
    mutate(() => {
      const node = { children: [], id: nextID(map), position: { x: parent.position.x + (parent.position.x < 800 ? -250 : 250), y: parent.position.y + 90 }, title: "新節點" };
      parent.children.push(node);
      selectedID = node.id;
    });
  };

  const addSibling = () => {
    const current = selectedNode();
    if (!current) return addChild();
    const parent = findParent(map.roots, current.id);
    if (!parent) return addChild();
    mutate(() => {
      const node = { children: [], id: nextID(map), position: { x: current.position.x, y: current.position.y + 80 }, title: "新節點" };
      parent.children.splice(parent.children.indexOf(current) + 1, 0, node);
      selectedID = node.id;
    });
  };

  const expandWithAgent = async () => {
    const parent = selectedNode();
    if (!parent) { setStatus("請先選取要延伸的節點。", "error"); return; }
    if (aiLoading) return;

    const count = Math.max(3, Math.min(6, Number(aiCountInput.value) || 4));
    const ancestry = findNodePath(map.roots, parent.id)?.map((node) => node.title) ?? [parent.title];
    const request = {
      mode: "expand-node",
      count,
      language: "Follow the selected node language",
      instruction: aiPromptInput.value.trim() || "補足關鍵面向，內容具體、互不重複且適合直接成為下一層心智圖節點。",
      mapTitle: map.title || map.roots[0]?.title,
      ancestry,
      selectedNode: {
        id: parent.id,
        title: parent.title,
        note: parent.note || undefined,
      },
      existingChildren: parent.children.map((child) => child.title),
      responseContract: { nodes: [{ title: "string, max 72 chars", note: "optional string, max 240 chars" }] },
    };

    aiLoading = true;
    syncInspector();
    aiState.textContent = `xmind-node-agent 正在分析「${parent.title}」...`;
    setStatus(`正在使用 xmind-node-agent 延伸「${parent.title}」...`, "busy");

    try {
      const response = await host.api.executeAgentPrompt({
        agent: "xmind-node-agent",
        prompt: `XMind UI node expansion request:\n${JSON.stringify(request, null, 2)}`,
        timeoutMs: 90000,
        title: `XMind AI 延伸：${parent.title}`,
      });
      if (disposed) return;
      if (findNode(map.roots, parent.id) !== parent) throw new Error("等待 Agent 時目前節點已被移除，未套用生成結果。");

      const suggestions = parseAgentNodes(response, count, parent.children);
      if (!suggestions.length) throw new Error("Agent 沒有回傳可用的節點。");
      suggestions.forEach((suggestion) => {
        parent.children.push({
          children: [],
          generatedBy: "xmind-node-agent",
          id: nextID(map),
          note: suggestion.note,
          position: undefined,
          title: suggestion.title,
        });
      });
      render();
      aiState.textContent = `已新增 ${suggestions.length} 個分支，可直接拖曳或編輯。`;
      setStatus(`xmind-node-agent 已從「${parent.title}」新增 ${suggestions.length} 個節點。`, "success");
    } catch (error) {
      if (disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      aiState.textContent = `延伸失敗：${message}`;
      reportError(error, "AI 節點延伸失敗：");
    } finally {
      aiLoading = false;
      if (!disposed) syncInspector();
    }
  };

  const appendPlanMessage = (role, message) => {
    const bubble = document.createElement("p");
    bubble.className = `xmind-chat-message ${role}`;
    bubble.textContent = message;
    planLog.append(bubble);
    planLog.scrollTop = planLog.scrollHeight;
  };

  const generatePlanWithAgent = async () => {
    const requirement = planPromptInput.value.trim();
    if (!requirement) { planPromptInput.focus(); planState.textContent = "請先描述要規劃的整體需求。"; return; }
    if (planLoading) return;
    planLoading = true;
    planButton.disabled = true;
    planButton.textContent = "正在規劃...";
    planState.textContent = "xmind-plan-agent 正在建立中心主題與多層分支...";
    appendPlanMessage("user", requirement);
    setStatus("正在產生完整 XMind 規劃...", "busy");

    try {
      const response = await host.api.executeAgentPrompt({
        agent: "xmind-plan-agent",
        prompt: `XMind whole-map planning request:\n${JSON.stringify({ mode: "plan-map", requirement, responseContract: { title: "string", nodes: [{ title: "string", note: "optional string", children: [] }] } }, null, 2)}`,
        timeoutMs: 120000,
        title: `XMind 整體規劃：${requirement.slice(0, 48)}`,
      });
      if (disposed) return;
      const plan = parseAgentPlan(response);
      map = { roots: [{ children: plan.nodes, id: "root", position: { x: 800, y: 450 }, title: plan.title }], title: plan.title, warnings: [] };
      const plannedPath = `${safeFileName(plan.title)}.xmind`;
      sourceInput.value = plannedPath;
      xmindOutputInput.value = plannedPath;
      markdownOutputInput.value = plannedPath.replace(/\.xmind$/i, ".md");
      updateCurrentFile(plannedPath);
      selectedID = null;
      nodePopoverOpen = false;
      render();
      fit();
      appendPlanMessage("agent", `已建立「${plan.title}」，包含 ${flatten(plan.nodes).length} 個規劃節點。`);
      planState.textContent = "規劃已放到畫布；點擊任一節點可再局部延伸。";
      setStatus(`已完成「${plan.title}」心智圖規劃。`, "success");
      planPromptInput.value = "";
    } catch (error) {
      if (disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      appendPlanMessage("agent error", `規劃失敗：${message}`);
      planState.textContent = `規劃失敗：${message}`;
      reportError(error, "整體規劃失敗：");
    } finally {
      planLoading = false;
      if (!disposed) {
        planButton.disabled = false;
        planButton.textContent = "✦ 產生完整心智圖";
      }
    }
  };

  const deleteSelected = () => {
    const node = selectedNode();
    if (!node || map.roots.includes(node)) { setStatus("中心節點不能刪除。", "error"); return; }
    mutate(() => { removeNode(map.roots, selectedID); selectedID = null; nodePopoverOpen = false; });
  };

  const newMap = () => {
    map = newDocument();
    sourceInput.value = "mindmap.xmind";
    xmindOutputInput.value = "mindmap.xmind";
    markdownOutputInput.value = "mindmap.md";
    updateCurrentFile("mindmap.xmind");
    selectedID = null;
    nodePopoverOpen = false;
    render();
    fit();
    aiState.textContent = "將從「中心主題」建立下一層分支。";
    setStatus("已建立新的 XMind 心智圖。", "success");
  };

  const load = async () => {
    const path = sourceInput.value.trim();
    if (!path) { setStatus("請輸入 .xmind 或 .md 路徑。", "error"); return; }
    setStatus(`正在讀取 ${path}...`);
    try {
      const bytes = await responseBytes(await host.api.readProjectFile(path));
      map = path.toLowerCase().endsWith(".xmind") ? await parseXMind(bytes, path) : parseMarkdown(textDecoder.decode(bytes), path);
      selectedID = null;
      nodePopoverOpen = false;
      if (!mdOutputTouched) markdownOutputInput.value = path.replace(/\.xmind$/i, ".md");
      if (!xmindOutputTouched && path.toLowerCase().endsWith(".xmind")) xmindOutputInput.value = path;
      updateCurrentFile(path);
      render();
      fit();
      aiState.textContent = `將從「${map.roots[0]?.title || "中心主題"}」建立下一層分支。`;
      if (path.toLowerCase().endsWith(".xmind")) {
        const markdownPath = path.replace(/\.xmind$/i, ".md");
        await host.api.writeProjectFile({ content: serializeMarkdown(map), path: markdownPath });
        setStatus(`已載入 ${path}，並建立 ${markdownPath} 供 Agent 使用。`, "success");
      } else {
        setStatus(`已載入 ${path}。`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`載入失敗：${message}`, "error");
      host.ui.showError(message);
    }
  };

  const isWriteConflictError = (error) => Number(error?.status) === 409 || error?.code === "FILE_EXISTS";

  const normalizeXMindPath = (value) => {
    const path = String(value || "").trim().replace(/\\/g, "/");
    if (!path || path.startsWith("/") || /^[A-Za-z]:\//.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("檔案路徑必須是目前 Project 內的相對路徑。");
    }
    return path.toLowerCase().endsWith(".xmind") ? path : `${path}.xmind`;
  };

  const projectFileExists = async (path) => {
    return host.api.fileExists(path);
  };

  const findExistingOutput = async (path) => {
    const markdownPath = path.replace(/\.xmind$/i, ".md");
    const candidates = await Promise.all([path, markdownPath].map(async (candidate) => (await projectFileExists(candidate) ? candidate : undefined)));
    return candidates.find(Boolean);
  };

  const suggestedSaveAsPath = (path) => {
    const normalized = String(path || "mindmap.xmind").replace(/\\/g, "/");
    const segments = normalized.split("/");
    const filename = segments.pop() || "mindmap.xmind";
    const stem = filename.replace(/\.xmind$/i, "") || "mindmap";
    segments.push(`${stem}-copy.xmind`);
    return segments.join("/");
  };

  const requestSaveAsPath = (conflictingPath, explicit = false) => {
    const message = explicit
      ? "另存 XMind：請輸入目前 Project 內的檔案路徑。"
      : `「${conflictingPath}」或其 Markdown 檔案已存在，請輸入新的 XMind 檔案路徑。`;
    const value = window.prompt(message, suggestedSaveAsPath(conflictingPath));
    if (value === null) return null;
    return normalizeXMindPath(value);
  };

  const writeXMindFiles = async (path) => {
    const markdownPath = path.replace(/\.xmind$/i, ".md");
    await host.api.writeProjectFile({ content: encodeBase64(serializeXMind(map)), encoding: "base64", overwrite: false, path });
    await host.api.writeProjectFile({ content: serializeMarkdown(map), overwrite: false, path: markdownPath });
    return markdownPath;
  };

  const saveXMindToPath = async (path) => {
    const existingPath = await findExistingOutput(path);
    if (existingPath) return { conflict: existingPath };

    try {
      return { markdownPath: await writeXMindFiles(path) };
    } catch (error) {
      if (isWriteConflictError(error)) return { conflict: path };
      throw error;
    }
  };

  const saveXMind = async () => {
    const rawPath = xmindOutputInput.value.trim();
    if (!rawPath.toLowerCase().endsWith(".xmind")) { setStatus("XMind 輸出必須是 .xmind。", "error"); return; }

    try {
      let path = normalizeXMindPath(rawPath);
      while (true) {
        const result = await saveXMindToPath(path);
        if (!result.conflict) {
          const markdownPath = result.markdownPath;
          sourceInput.value = path;
          xmindOutputInput.value = path;
          markdownOutputInput.value = markdownPath;
          updateCurrentFile(path);
          setStatus(`已儲存到目前 Project：${path}，並同步 ${markdownPath}。`, "success");
          return;
        }

        const nextPath = requestSaveAsPath(result.conflict);
        if (nextPath === null) {
          setStatus("已取消另存 XMind。", "");
          return;
        }
        path = nextPath;
      }
    } catch (error) { reportError(error, "XMind 儲存失敗："); }
  };

  const saveXMindAs = async () => {
    try {
      const currentPath = xmindOutputInput.value.trim() || `${safeFileName(map.title || "mindmap")}.xmind`;
      const path = requestSaveAsPath(currentPath, true);
      if (path === null) {
        setStatus("已取消另存 XMind。", "");
        return;
      }

      let targetPath = path;
      while (true) {
        const result = await saveXMindToPath(targetPath);
        if (!result.conflict) {
          const markdownPath = result.markdownPath;
          sourceInput.value = targetPath;
          xmindOutputInput.value = targetPath;
          markdownOutputInput.value = markdownPath;
          updateCurrentFile(targetPath);
          setStatus(`已另存到目前 Project：${targetPath}，並同步 ${markdownPath}。`, "success");
          return;
        }

        const nextPath = requestSaveAsPath(result.conflict);
        if (nextPath === null) {
          setStatus("已取消另存 XMind。", "");
          return;
        }
        targetPath = nextPath;
      }
    } catch (error) { reportError(error, "XMind 另存失敗："); }
  };

  const downloadXMind = () => {
    const candidate = xmindOutputInput.value.trim().replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || `${safeFileName(map.title || "mindmap")}.xmind`;
    const filename = candidate.toLowerCase().endsWith(".xmind") ? candidate : `${candidate}.xmind`;
    const objectURL = URL.createObjectURL(new Blob([serializeXMind(map)], { type: "application/vnd.xmind.workbook" }));
    const anchor = document.createElement("a");
    anchor.href = objectURL;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectURL), 0);
    setStatus(`已下載 ${filename}。`, "success");
  };

  const reportError = (error, prefix) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`${prefix}${message}`, "error");
    host.ui.showError(message);
  };

  const startDrag = (event, node, element) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    element.setPointerCapture?.(event.pointerId);
    drag = {
      element,
      moved: false,
      node,
      origin: { ...node.position },
      pointerId: event.pointerId,
      start: pointerToWorld(event),
      startClient: { x: event.clientX, y: event.clientY },
    };
  };

  const pointerMove = (event) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y) < 4) return;
    drag.moved = true;
    const point = pointerToWorld(event);
    drag.node.position = { x: drag.origin.x + point.x - drag.start.x, y: drag.origin.y + point.y - drag.start.y };
    renderCanvas();
  };

  const pointerUp = () => {
    if (!drag) return;
    const selected = drag.node;
    const moved = drag.moved;
    try { drag.element.releasePointerCapture?.(drag.pointerId); } catch { /* The SVG node may have been replaced during drag rendering. */ }
    drag = null;
    if (moved) {
      lastNodeClick = { id: null, time: 0 };
      selectNode(selected.id, false);
      return;
    }
    const now = Date.now();
    const openPopover = lastNodeClick.id === selected.id && now - lastNodeClick.time <= 360;
    lastNodeClick = openPopover ? { id: null, time: 0 } : { id: selected.id, time: now };
    selectNode(selected.id, openPopover);
    if (openPopover) { titleInput.focus(); titleInput.select(); }
  };

  const pointerToWorld = (event) => {
    const bounds = canvas.getBoundingClientRect();
    const rawX = (event.clientX - bounds.left) / bounds.width * 1600;
    const rawY = (event.clientY - bounds.top) / bounds.height * 900;
    return { x: (rawX - pan.x) / zoom, y: (rawY - pan.y) / zoom };
  };

  const positionNodePopover = () => {
    const node = selectedNode();
    if (!node?.position || nodePopover.hidden) return;
    const canvasBounds = canvas.getBoundingClientRect();
    const paneBounds = canvasPane.getBoundingClientRect();
    const isRoot = map.roots.includes(node);
    const scaledNodeWidth = nodeWidth(node, isRoot) * zoom / 1600 * canvasBounds.width;
    const centerX = (pan.x + node.position.x * zoom) / 1600 * canvasBounds.width + canvasBounds.left - paneBounds.left;
    const centerY = (pan.y + node.position.y * zoom) / 900 * canvasBounds.height + canvasBounds.top - paneBounds.top;
    const popoverWidth = nodePopover.offsetWidth || 320;
    const popoverHeight = nodePopover.offsetHeight || 420;
    const placeRight = centerX < paneBounds.width * .62;
    const desiredLeft = placeRight ? centerX + scaledNodeWidth / 2 + 18 : centerX - scaledNodeWidth / 2 - popoverWidth - 18;
    nodePopover.style.left = `${Math.max(10, Math.min(paneBounds.width - popoverWidth - 10, desiredLeft))}px`;
    nodePopover.style.top = `${Math.max(10, Math.min(paneBounds.height - popoverHeight - 10, centerY - 70))}px`;
  };

  const applyViewportTransform = () => { viewport.setAttribute("transform", `translate(${pan.x} ${pan.y}) scale(${zoom})`); positionNodePopover(); };
  const changeZoom = (delta) => { zoom = Math.max(.45, Math.min(2.2, zoom + delta)); applyViewportTransform(); };
  const fit = () => { zoom = 1; pan = { x: 0, y: 0 }; applyViewportTransform(); };

  canvas.addEventListener("wheel", (event) => { event.preventDefault(); changeZoom(event.deltaY < 0 ? .1 : -.1); }, { passive: false });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.target !== canvas && event.target !== root.querySelector('[data-role="canvas-bg"]')) return;
    const start = { x: event.clientX, y: event.clientY, pan: { ...pan } };
    const move = (next) => { const bounds = canvas.getBoundingClientRect(); pan = { x: start.pan.x + (next.clientX - start.x) / bounds.width * 1600, y: start.pan.y + (next.clientY - start.y) / bounds.height * 900 }; applyViewportTransform(); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  });
  window.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("resize", positionNodePopover);
  const canvasResizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => positionNodePopover());
  canvasResizeObserver?.observe(canvasPane);
  canvas.addEventListener("click", (event) => { if (event.target === canvas || event.target === root.querySelector('[data-role="canvas-bg"]')) { selectedID = null; nodePopoverOpen = false; render(); aiState.textContent = "選取節點後，可由自訂 Agent 產生下一層分支。"; } });
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveXMind(); }
  });

  titleInput.addEventListener("input", () => { const node = selectedNode(); if (node) { node.title = titleInput.value || "Untitled topic"; renderCanvas(); selectionLabel.textContent = `${node.title} · ${node.id}`; } });
  noteInput.addEventListener("input", () => { const node = selectedNode(); if (node) { node.note = noteInput.value; } });
  linkInput.addEventListener("input", () => { const node = selectedNode(); if (node) { node.hyperlink = linkInput.value; } });
  taskInput.addEventListener("change", () => { const node = selectedNode(); if (node) { node.taskStatus = taskInput.value || undefined; renderCanvas(); } });
  markdownOutputInput.addEventListener("input", () => { mdOutputTouched = true; });
  xmindOutputInput.addEventListener("input", () => { xmindOutputTouched = true; });
  if (typeof context?.onBack === "function") backButton.addEventListener("click", context.onBack);
  else backButton.hidden = true;
  planPresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      planPromptInput.value = button.dataset.planPrompt || "";
      planPromptInput.focus();
    });
  });
  planButton.addEventListener("click", () => void generatePlanWithAgent());
  planPromptInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void generatePlanWithAgent(); }
  });
  root.querySelector('[data-action="deselect"]').addEventListener("click", () => { nodePopoverOpen = false; render(); });
  root.querySelector('[data-action="new"]').addEventListener("click", newMap);
  root.querySelector('[data-action="load"]').addEventListener("click", () => void load());
  root.querySelector('[data-action="download-xmind"]').addEventListener("click", downloadXMind);
  root.querySelector('[data-action="save-xmind"]').addEventListener("click", () => void saveXMind());
  root.querySelector('[data-action="save-as-xmind"]').addEventListener("click", () => void saveXMindAs());
  root.querySelector('[data-action="add-child"]').addEventListener("click", addChild);
  root.querySelector('[data-action="add-sibling"]').addEventListener("click", addSibling);
  root.querySelector('[data-action="add-child-inspector"]').addEventListener("click", addChild);
  root.querySelector('[data-action="add-sibling-inspector"]').addEventListener("click", addSibling);
  deleteInspectorButton.addEventListener("click", deleteSelected);
  aiButtons.forEach((button) => button.addEventListener("click", () => void expandWithAgent()));
  root.querySelector('[data-action="delete"]').addEventListener("click", deleteSelected);
  root.querySelector('[data-action="zoom-out"]').addEventListener("click", () => changeZoom(-.1));
  root.querySelector('[data-action="zoom-in"]').addEventListener("click", () => changeZoom(.1));
  root.querySelector('[data-action="fit"]').addEventListener("click", fit);
  render();
  fit();
  const initialFilePath = String(context?.initialFilePath || "").trim();
  if (initialFilePath.toLowerCase().endsWith(".xmind")) {
    sourceInput.value = initialFilePath;
    markdownOutputInput.value = initialFilePath.replace(/\.xmind$/i, ".md");
    xmindOutputInput.value = initialFilePath;
    updateCurrentFile(initialFilePath);
    void load();
  }

  return { destroy() { disposed = true; canvasResizeObserver?.disconnect(); window.removeEventListener("pointermove", pointerMove); window.removeEventListener("pointerup", pointerUp); window.removeEventListener("resize", positionNodePopover); container.replaceChildren(); } };
}

function newDocument() { return { roots: [{ children: [], id: "root", position: { x: 800, y: 450 }, title: "中心主題" }], title: "中心主題", warnings: [] }; }
function flatten(nodes) { return nodes.flatMap((node) => [node, ...flatten(node.children)]); }
function findNode(nodes, id) { return nodes.flatMap((node) => [node, ...flatten(node.children)]).find((node) => node.id === id); }
function findNodePath(nodes, id, ancestors = []) { for (const node of nodes) { const path = [...ancestors, node]; if (node.id === id) return path; const childPath = findNodePath(node.children, id, path); if (childPath) return childPath; } return undefined; }
function findParent(nodes, id) { for (const node of nodes) { if (node.children.some((child) => child.id === id)) return node; const parent = findParent(node.children, id); if (parent) return parent; } return undefined; }
function removeNode(nodes, id) { const index = nodes.findIndex((node) => node.id === id); if (index >= 0) { nodes.splice(index, 1); return true; } for (const node of nodes) if (removeNode(node.children, id)) return true; return false; }
function nextID(map) { return `node-${Date.now().toString(36)}-${flatten(map.roots).length + 1}`; }
function nodeWidth(node, isRoot = false) { return Math.min(260, Math.max(isRoot ? 160 : 132, node.title.length * 12 + 34)); }
function branchTheme(node) { let seed = 0; for (const character of node.id) seed += character.charCodeAt(0); return BRANCH_THEMES[seed % BRANCH_THEMES.length]; }
function parseAgentNodes(response, limit, existingChildren) {
  const value = response && typeof response === "object" && response.data ? response.data : response;
  const parts = Array.isArray(value?.parts) ? value.parts : [];
  const text = parts.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text.trim()).filter(Boolean).join("\n");
  if (!text) throw new Error("Agent 回應沒有可解析的文字內容。");

  const tagged = /<xmind-nodes>\s*([\s\S]*?)\s*<\/xmind-nodes>/i.exec(text)?.[1];
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(tagged || text)?.[1];
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  const candidate = (fenced || tagged || (objectStart >= 0 && objectEnd > objectStart ? text.slice(objectStart, objectEnd + 1) : text)).trim();
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("Agent 回應不是有效的節點 JSON。");
  }

  const values = Array.isArray(parsed) ? parsed : parsed?.nodes;
  if (!Array.isArray(values)) throw new Error("Agent 回應缺少 nodes 陣列。");
  const seen = new Set(existingChildren.map((child) => child.title.trim().toLocaleLowerCase()));
  const nodes = [];
  for (const value of values) {
    const rawTitle = typeof value === "string" ? value : value?.title;
    const title = String(rawTitle || "").replace(/\s+/g, " ").trim().slice(0, 72);
    const key = title.toLocaleLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    const rawNote = typeof value === "object" && value ? value.note : undefined;
    const note = typeof rawNote === "string" ? rawNote.replace(/\s+/g, " ").trim().slice(0, 240) : undefined;
    nodes.push({ title, ...(note ? { note } : {}) });
    if (nodes.length >= limit) break;
  }
  return nodes;
}
function parseAgentPlan(response) {
  const value = response && typeof response === "object" && response.data ? response.data : response;
  const parts = Array.isArray(value?.parts) ? value.parts : [];
  const text = parts.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text.trim()).filter(Boolean).join("\n");
  if (!text) throw new Error("規劃 Agent 沒有回傳文字內容。");
  const tagged = /<xmind-plan>\s*([\s\S]*?)\s*<\/xmind-plan>/i.exec(text)?.[1];
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(tagged || text)?.[1];
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  const candidate = (fenced || tagged || (objectStart >= 0 && objectEnd > objectStart ? text.slice(objectStart, objectEnd + 1) : text)).trim();
  let parsed;
  try { parsed = JSON.parse(candidate); } catch { throw new Error("規劃 Agent 回應不是有效 JSON。"); }
  const title = String(parsed?.title || "").replace(/\s+/g, " ").trim().slice(0, 72);
  if (!title || !Array.isArray(parsed?.nodes)) throw new Error("規劃 Agent 回應缺少 title 或 nodes。");
  const counter = { value: 0 };
  const nodes = normalizePlanNodes(parsed.nodes, 0, counter);
  if (!nodes.length) throw new Error("規劃 Agent 沒有產生可用節點。");
  return { title, nodes };
}
function normalizePlanNodes(values, depth, counter) {
  if (!Array.isArray(values) || depth >= 4 || counter.value >= 80) return [];
  const seen = new Set();
  const nodes = [];
  for (const value of values.slice(0, 12)) {
    const title = String(typeof value === "string" ? value : value?.title || "").replace(/\s+/g, " ").trim().slice(0, 72);
    const key = title.toLocaleLowerCase();
    if (!title || seen.has(key) || counter.value >= 80) continue;
    seen.add(key);
    counter.value += 1;
    const noteValue = typeof value === "object" && value ? value.note : undefined;
    const note = typeof noteValue === "string" ? noteValue.replace(/\s+/g, " ").trim().slice(0, 240) : undefined;
    nodes.push({ children: normalizePlanNodes(value?.children, depth + 1, counter), id: `plan-${depth}-${counter.value}`, ...(note ? { note } : {}), position: undefined, title });
  }
  return nodes;
}
function ensureLayout(map) {
  const roots = map.roots;
  if (!roots.length) return;
  const columns = Math.max(1, Math.ceil(Math.sqrt(roots.length)));
  const rows = Math.ceil(roots.length / columns);
  const cellWidth = 1600 / columns;
  const cellHeight = 900 / rows;
  roots.forEach((root, rootIndex) => {
    if (!root.position) {
      root.position = {
        x: cellWidth * ((rootIndex % columns) + 0.5),
        y: cellHeight * (Math.floor(rootIndex / columns) + 0.5),
      };
    }
    const sides = [
      root.children.filter((_, index) => index % 2 === 0),
      root.children.filter((_, index) => index % 2 === 1),
    ];
    sides.forEach((nodes, sideIndex) => {
      const side = sideIndex === 0 ? 1 : -1;
      const spacing = Math.max(84, Math.min(180, cellHeight * 0.62 / Math.max(nodes.length, 1)));
      nodes.forEach((node, index) => {
        layoutBranch(node, side, 1, root.position.x + side * Math.min(260, cellWidth * 0.28), root.position.y + (index - (nodes.length - 1) / 2) * spacing, Math.max(180, spacing));
      });
    });
  });
}
function layoutBranch(node, side, depth, x, y, span) { if (!node.position) node.position = { x, y }; node.children.forEach((child, index) => layoutBranch(child, side, depth + 1, node.position.x + side * 250, node.position.y + (index - (node.children.length - 1) / 2) * Math.max(65, span / Math.max(node.children.length, 1)), Math.max(100, span / Math.max(node.children.length, 1)))); }

async function responseBytes(response) { const value = response && typeof response === "object" ? response : {}; if (value.encoding === "base64" || value.type === "binary") return decodeBase64(value.content || ""); return new TextEncoder().encode(String(value.content || response || "")); }
async function parseXMind(bytes, sourceName) { const json = await readZipEntry(bytes, "content.json"); const xml = json ? undefined : await readZipEntry(bytes, "content.xml"); const roots = json ? parseJsonSheets(JSON.parse(new TextDecoder().decode(json))) : xml ? parseXmlSheets(new TextDecoder().decode(xml)) : []; if (!roots.length) throw new Error("XMind 檔案沒有可編輯的節點。"); return { roots, sourceName, title: roots[0].title, warnings: [] }; }
function parseMarkdown(markdown, sourceName) { const lines = markdown.split(/\r?\n/); const roots = []; const stack = [{ level: -1, children: roots }]; let counter = 0; for (const line of lines) { const heading = /^(#{1,6})\s+(.+)$/.exec(line); const bullet = /^(\s*)[-*+]\s+(.+)$/.exec(line); if (!heading && !bullet) continue; const level = heading ? heading[1].length - 1 : Math.floor(bullet[1].length / 2) + 1; while (stack.at(-1).level >= level) stack.pop(); const node = { children: [], id: `node-${++counter}`, position: undefined, title: heading?.[2] || bullet?.[2] }; stack.at(-1).children.push(node); stack.push({ level, children: node.children }); } return { roots: roots.length ? roots : [{ children: [], id: "root", title: "中心主題" }], sourceName, title: roots[0]?.title || "中心主題", warnings: [] }; }
function parseJsonSheets(value) { const sheets = Array.isArray(value) ? value : Array.isArray(value?.sheets) ? value.sheets : [value]; const roots = sheets.flatMap((sheet, index) => { const root = toTopic(sheet?.rootTopic || sheet?.root_topic || sheet?.root || sheet?.topic, `sheet-${index + 1}-root`); return root ? [root] : []; }); return roots.length ? roots : (toTopic(value, "root") ? [toTopic(value, "root")] : []); }
function toTopic(value, fallback, seen = new Set()) { if (!value || typeof value !== "object" || Array.isArray(value) || seen.has(value)) return undefined; seen.add(value); const id = textValue(value.id) || textValue(value.topicId) || fallback; const children = []; for (const container of [value.children, value.subtopics, value.topics, value.childTopics]) { const values = container && typeof container === "object" && !Array.isArray(container) ? [container.attached, container.detached, container.items].flatMap((item) => Array.isArray(item) ? item : item ? [item] : []) : Array.isArray(container) ? container : container ? [container] : []; values.forEach((child, index) => { const parsed = toTopic(child, `${id}-${index + 1}`, seen); if (parsed) children.push(parsed); }); } return { children, id, hyperlink: textValue(value.hyperlink) || textValue(value.href), note: textValue(value.notes || value.note), taskStatus: normalizeTask(textValue(value.taskStatus) || textValue(value.marker)), title: cleanText(textValue(value.title) || textValue(value.topicTitle) || textValue(value.name) || "Untitled topic") }; }
function parseXmlSheets(text) { const parsed = new DOMParser().parseFromString(text, "application/xml"); const sheets = Array.from(parsed.getElementsByTagName("sheet")); return (sheets.length ? sheets : [parsed.documentElement]).flatMap((sheet, index) => { const root = directChildren(sheet, "topic")[0]; return root ? [xmlTopic(root, `sheet-${index + 1}`)] : []; }); }
function xmlTopic(element, id) { return { children: directChildren(element, "topic").map((child, index) => xmlTopic(child, `${id}-${index + 1}`)), id: element.getAttribute("id") || id, note: directText(element, "notes"), title: cleanText(directText(element, "title") || "Untitled topic") }; }
function directChildren(element, name) { return Array.from(element.children).filter((child) => (child.localName || child.tagName).toLowerCase() === name); }
function directText(element, name) { const child = Array.from(element.children).find((item) => (item.localName || item.tagName).toLowerCase() === name); return child?.textContent?.replace(/\s+/g, " ").trim(); }
async function readZipEntry(bytes, wantedName) { const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const end = findEnd(view); const count = view.getUint16(end + 10, true); let offset = view.getUint32(end + 16, true); for (let index = 0; index < count; index += 1) { if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("XMind ZIP central directory 無效。"); const method = view.getUint16(offset + 10, true); const size = view.getUint32(offset + 20, true); const nameLength = view.getUint16(offset + 28, true); const extraLength = view.getUint16(offset + 30, true); const commentLength = view.getUint16(offset + 32, true); const local = view.getUint32(offset + 42, true); const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)); offset += 46 + nameLength + extraLength + commentLength; if (name.toLowerCase() !== wantedName.toLowerCase()) continue; const localName = view.getUint16(local + 26, true); const localExtra = view.getUint16(local + 28, true); const start = local + 30 + localName + localExtra; const compressed = bytes.subarray(start, start + size); if (method === 0) return compressed.slice(); if (typeof DecompressionStream === "undefined") throw new Error("瀏覽器不支援 XMind ZIP 解壓縮。"); const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw")); return new Uint8Array(await new Response(stream).arrayBuffer()); } return undefined; }
function findEnd(view) { for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65557); offset -= 1) if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === view.byteLength) return offset; throw new Error("不是有效的 XMind ZIP。"); }
function serializeMarkdown(map) { const lines = ["<!-- Generated by XMind editor. -->", ""]; map.roots.forEach((root) => { lines.push(`# ${root.title}`, ""); appendMarkdown(lines, root.children, 0); }); return `${lines.join("\n").trim()}\n`; }
function appendMarkdown(lines, nodes, depth) { nodes.forEach((node) => { lines.push(`${"  ".repeat(depth)}- ${node.title}${node.taskStatus ? ` [${node.taskStatus}]` : ""}`); if (node.note) lines.push(`${"  ".repeat(depth + 1)}> ${node.note}`); if (node.hyperlink) lines.push(`${"  ".repeat(depth + 1)}> Link: ${node.hyperlink}`); appendMarkdown(lines, node.children, depth + 1); }); }
function serializeXMind(map) {
  const encoder = new TextEncoder();
  const sheets = map.roots.map((root, index) => ({
    class: "sheet",
    id: `sheet-${index + 1}`,
    rootTopic: { ...toXMindTopic(root), structureClass: "org.xmind.ui.map.unbalanced" },
    title: root.title,
  }));
  const content = encoder.encode(JSON.stringify(sheets, null, 2));
  const metadata = encoder.encode(JSON.stringify({
    activeSheetId: sheets[0]?.id || "sheet-1",
    creator: { name: "Agent System", version: "1.0.0" },
    dataStructureVersion: "2",
    layoutEngineVersion: "3",
  }, null, 2));
  const manifest = encoder.encode(JSON.stringify({
    "file-entries": {
      "content.json": {},
      "metadata.json": {},
    },
  }, null, 2));
  return createZip([
    { content, name: "content.json" },
    { content: metadata, name: "metadata.json" },
    { content: manifest, name: "manifest.json" },
  ]);
}
function toXMindTopic(node) { return { children: node.children.length ? { attached: node.children.map(toXMindTopic) } : undefined, class: "topic", id: node.id, href: node.hyperlink, markers: node.taskStatus ? [{ markerId: `task-${node.taskStatus}` }] : undefined, notes: node.note ? { plain: { content: node.note } } : undefined, title: node.title }; }
function createZip(files) {
  const local = [];
  const central = [];
  const modified = dosDateTime(new Date());
  let offset = 0;
  files.forEach((file) => {
    const name = new TextEncoder().encode(file.name);
    const checksum = crc32(file.content);
    const localPart = new Uint8Array(30 + name.length);
    const localView = new DataView(localPart.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(10, modified.time, true);
    localView.setUint16(12, modified.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, file.content.length, true);
    localView.setUint32(22, file.content.length, true);
    localView.setUint16(26, name.length, true);
    localPart.set(name, 30);
    local.push(localPart, file.content);

    const centralPart = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralPart.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(12, modified.time, true);
    centralView.setUint16(14, modified.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, file.content.length, true);
    centralView.setUint32(24, file.content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    centralPart.set(name, 46);
    central.push(centralPart);
    offset += localPart.length + file.content.length;
  });
  const localData = concatBytes(local);
  const centralData = concatBytes(central);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralData.length, true);
  view.setUint32(16, localData.length, true);
  return concatBytes([localData, centralData, end]);
}
function dosDateTime(value) { const year = Math.max(1980, Math.min(2107, value.getFullYear())); return { date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(), time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2) }; }
function concatBytes(parts) { const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0)); let offset = 0; parts.forEach((part) => { result.set(part, offset); offset += part.length; }); return result; }
function crc32(value) { let result = 0xffffffff; for (const byte of value) { result ^= byte; for (let bit = 0; bit < 8; bit += 1) result = (result >>> 1) ^ ((result & 1) ? 0xedb88320 : 0); } return (result ^ 0xffffffff) >>> 0; }
function encodeBase64(bytes) { let binary = ""; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }
function decodeBase64(value) { const binary = atob(String(value).replace(/\s/g, "")); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes; }
function textValue(value) { if (typeof value === "string" && value.trim()) return value.trim(); if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(" ") || undefined; if (!value || typeof value !== "object") return undefined; for (const key of ["plain", "text", "content", "value", "title"]) { const result = textValue(value[key]); if (result) return result; } return undefined; }
function normalizeTask(value) { const normalized = value?.toLowerCase(); if (!normalized) return undefined; if (normalized.includes("done") || normalized.includes("complete")) return "done"; if (normalized.includes("doing") || normalized.includes("progress")) return "doing"; if (normalized.includes("todo") || normalized.includes("start")) return "todo"; return undefined; }
function safeFileName(value) { return String(value || "mindmap").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim().slice(0, 80) || "mindmap"; }
function cleanText(value) { return String(value || "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim() || "Untitled topic"; }
function escapeHtml(value) { return String(value).replace(/[&<>\"]+/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character] || character)); }
