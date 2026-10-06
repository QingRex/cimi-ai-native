const content = document.querySelector("#content"), notice = document.querySelector("#notice");
const state = { context: null, dashboard: null, view: "dashboard", changeId: null, detail: null, pending: null, busy: false, loading: 0 };
const labels = { Draft: "待澄清", IntentReady: "约定已确认", Executing: "实施中", ReadyForDelivery: "待交付", Completed: "已完成", Terminated: "已终止",
  Active: "正常推进", Paused: "已暂停", Pending: "待执行", InProgress: "执行中", Satisfied: "已满足", Cancelled: "已取消", Reserved: "已预约",
  Running: "运行中", Unknown: "待核对", Failed: "失败", Collected: "已采集", Stopped: "已停止", Approve: "批准",
  pending: "待决定", approve: "已批准，待应用", applied: "已应用", stale: "已过期或依据已变", request_changes: "要求修改", reject: "拒绝",
  confirm_contract: "确认约定", confirm_plan: "确认计划", confirm_integration: "集成专业复核", verify_decision_conditions: "核对决定条件", invalidate_evidence: "处置失效证据",
  implementation: "实施", verification: "独立验证", knowledge: "知识", synchronization: "同步", requirement: "需求", bug: "缺陷", open: "开放", closed: "已关闭",
  requirement_owner: "需求负责人", technical_owner: "技术负责人", quality_owner: "质量负责人", flow_owner: "推进协调人", project_owner: "项目负责人" };
const label = value => labels[value] ?? value ?? "—";
const lines = value => String(value ?? "").split(/\r?\n/).map(item => item.trim()).filter(Boolean);
const node = (tag, attributes = {}, ...children) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else if (key === "class") element.className = value;
    else if (key in element) element[key] = value;
    else element.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return element;
};
const paragraph = (text, className = "muted") => node("p", { class: className }, text);
const badge = value => node("span", { class: `badge ${["Satisfied", "Completed", "applied"].includes(value) ? "good" : ["Unknown", "Paused", "pending"].includes(value) ? "warn" : ["Failed", "reject"].includes(value) ? "bad" : ""}` }, label(value));
const panel = (title, ...children) => node("section", { class: "panel" }, node("h2", {}, title), ...children);
const facts = entries => node("dl", {}, entries.map(([key, value]) => [node("dt", {}, key), node("dd", {}, value ?? "—")]));
const details = (title, value) => node("details", {}, node("summary", {}, title), node("pre", {}, JSON.stringify(value, null, 2)));
const input = (name, title, options = {}) => node("label", {}, title, node("input", { name, ...options }));
const textarea = (name, title, options = {}) => node("label", {}, title, node("textarea", { name, ...options }));
const select = (name, title, options, selected = "") => node("label", {}, title, node("select", { name }, options.map(([value, title]) => node("option", { value, selected: value === selected }, title))));
const button = (text, action, className = "") => node("button", { type: "button", class: className, onclick: () => { void Promise.resolve().then(action).catch(showError); }, disabled: state.busy }, text);
const submit = text => node("button", { type: "submit", class: "primary", disabled: state.busy }, text);
const fieldValues = form => Object.fromEntries(new FormData(form).entries());
const form = (action, ...fields) => node("form", { onsubmit: event => {
  event.preventDefault(); const submitted = event.currentTarget;
  if (!state.busy) void Promise.resolve().then(() => action(fieldValues(submitted))).catch(showError);
} }, ...fields);
const actorName = id => state.dashboard?.governance.actors.find(actor => actor.id === id)?.display_name ?? id ?? "未指定";
const actors = () => state.dashboard.governance.actors.filter(actor => actor.actor_type === "human").map(actor => [actor.id, actor.display_name]);
const showNotice = (message, isError = false, ...actions) => { notice.className = isError ? "error" : ""; notice.replaceChildren(node("div", {}, message), ...actions); };
const showError = error => showNotice(error.message ?? String(error), true);
const uuid = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); let timestamp = Date.now();
  for (let index = 5; index >= 0; index--) { bytes[index] = timestamp % 256; timestamp = Math.floor(timestamp / 256); }
  bytes[6] = (bytes[6] & 15) | 112; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const api = async (path, body) => {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...(body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json", "X-CimiLoop-CSRF": state.context?.csrf ?? "" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) {
    const diagnostic = result.details?.diagnostic;
    const error = new Error(`${result.message ?? result.code}${diagnostic ? `；当前版本 ${diagnostic.current?.revision ?? "未知"}；缺项：${diagnostic.missing_conditions.join("、")}` : ""}`);
    error.status = response.status; error.code = result.code;
    error.nativeRejected = typeof result.category === "string"; throw error;
  }
  return result;
};
const mutation = async (type, payload, target, revision, role = "project_owner") => {
  if (state.pending) { showNotice("上次动作的结果还未核对，请先按原请求核对。", true, button("按原请求核对", replay)); return; }
  state.pending = { command_id: uuid(), requested_at: new Date().toISOString(), acting_role: role, command_type: type,
    ...(target ? { target } : {}), ...(revision === undefined ? {} : { expected_revision: revision }), payload };
  try { sessionStorage.setItem(`cimiloop.pending.${state.context.project_id}`, JSON.stringify(state.pending)); }
  catch { state.pending = null; throw new Error("浏览器无法保留待核对请求，动作尚未发送。请允许当前页面的会话存储后重试。"); }
  await replay();
};
const replay = async () => {
  if (!state.pending || state.busy) return;
  state.busy = true; document.querySelectorAll("form button").forEach(item => { item.disabled = true; });
  let committed = false;
  try {
    await api("/api/commands", state.pending); state.pending = null; committed = true;
    try { sessionStorage.removeItem(`cimiloop.pending.${state.context.project_id}`); } catch {}
    showNotice("动作已记录，正在刷新项目事实。");
  }
  catch (error) {
    // An expired session only rejects this transport attempt. It cannot prove
    // that a previously dispatched native command did not commit.
    if (error.nativeRejected && error.status < 500) {
      state.pending = null; try { sessionStorage.removeItem(`cimiloop.pending.${state.context.project_id}`); } catch {}
    }
    state.busy = false;
    showNotice(error.message, true, ...(state.pending ? [button("按原请求核对", replay), details("保留的动作请求", state.pending)] : [button("刷新当前事实", load)]));
  }
  finally { state.busy = false; document.querySelectorAll("form button").forEach(item => { item.disabled = false; }); }
  // A failed refresh cannot turn an already committed action into an unknown
  // command, nor cause a new command ID to be used to repeat it.
  if (committed) { try { await load(); } catch (error) { showNotice(`动作已记录，但刷新失败：${error.message}`, true, button("刷新当前事实", load)); } }
};
const changeTarget = change => ({ object_type: "change", id: change.id });
const changeLink = change => node("a", { href: `#change/${encodeURIComponent(change.id)}` }, `${change.display_key} · ${change.title}`);
const empty = message => paragraph(message, "empty");
const table = (columns, rows) => node("div", { class: "table-wrap" }, node("table", {}, node("thead", {}, node("tr", {}, columns.map(value => node("th", {}, value)))),
  node("tbody", {}, rows.map(row => node("tr", {}, row.map(value => node("td", {}, value)))))));
const changeTable = changes => changes.length ? table(["需求 / 缺陷", "当前阶段", "推进状态", "负责人", "目标版本"], changes.map(change => [
  changeLink(change), badge(change.lifecycle_state), badge(change.operating_status), actorName(change.owner_actor_id),
  state.dashboard.flow.target_versions.find(version => version.id === change.target_version_id)?.name ?? "未规划"
])) : empty("暂无需求。可以从需求池录入一句话，逐步明确约定和计划。");
const heading = (title, subtitle) => [node("h1", {}, title), paragraph(subtitle, "subtitle")];

const dashboard = () => {
  const { project, flow, execution, providers } = state.dashboard;
  return [...heading("项目工作台", "查看实际在制需求、执行缺口和当前可用能力。"),
    node("div", { class: "cards" }, [["需求与缺陷", flow.changes.length], ["在制需求", flow.wip.used], ["已暂停", flow.paused_changes.length], ["已满足任务", execution.tasks.filter(task => task.status === "Satisfied").length]].map(([title, count]) => node("div", { class: "card" }, paragraph(title), node("strong", {}, count)))),
    panel("正在推进", changeTable(flow.wip_changes)),
    node("div", { class: "split" }, panel("项目协作", facts([["项目", project.name], ["当前操作者", actorName(state.context.actor_id)], ["在制容量", flow.wip.limit === null ? "尚未设置" : `${flow.wip.used} / ${flow.wip.limit}`], ["事实序号", flow.as_of_event_sequence]]),
      paragraph("需要处理的决定可从决定收件箱进入；任务和交接在需求详情中查看。")),
    panel("执行能力", paragraph("人工任务、运行控制和交接已接通。正式 Agent 执行仍需完成 Runtime 验收；候选探针通过不代表任务执行已启用。"),
      paragraph(`已登记 Provider：${providers.descriptors?.length ?? 0}。`), details("Provider 的实际准入与缺口", providers)))];
};
const pool = () => {
  const { flow, project } = state.dashboard;
  return [...heading("需求池与版本", "目标版本用于规划；约定、实施与交付仍由每条需求自身推进。"), panel("全部需求与缺陷", changeTable(flow.changes)),
    node("div", { class: "split" }, panel("录入需求或缺陷", form(values => mutation("CreateChange", { title: values.title, kind: values.kind,
      ...(values.owner ? { requirement_owner_actor_id: values.owner } : {}), ...(values.version ? { target_version_id: values.version } : {}) }),
    input("title", "标题", { required: true, maxlength: 300, placeholder: "先记录期望结果，再逐步澄清" }), select("kind", "类型", [["requirement", "需求"], ["bug", "缺陷"]]),
    select("owner", "需求负责人", [["", "稍后指派"], ...actors()]), select("version", "目标版本", [["", "未规划"], ...flow.target_versions.filter(item => item.status === "open").map(item => [item.id, item.name])]), submit("录入"))),
    panel("目标版本", flow.target_versions.length ? table(["版本", "状态"], flow.target_versions.map(version => [version.name, label(version.status)])) : empty("暂无目标版本。未规划版本不影响录入与澄清。"),
      form(values => mutation("CreateTargetVersion", { name: values.name }, { object_type: "project", id: project.id }, project.revision, "flow_owner"), input("name", "新目标版本名称", { required: true, maxlength: 200 }), submit("创建目标版本"))))];
};
const candidateBody = (intent, request) => [...intent.contract_proposals, ...intent.plan_proposals].find(candidate => candidate.id === request.target_ref.id && candidate.proposal_revision === request.target_ref.domain_version);
const decisionCard = (change, intent, item) => {
  const request = item.request, candidate = candidateBody(intent, request), decision = intent.decisions.find(value => value.id === item.decision_ref?.id);
  const ordinary = ["confirm_contract", "confirm_plan"].includes(request.action);
  const result = panel(`${change.display_key} · ${label(request.action)}`, node("div", { class: "row" }, changeLink(change), badge(item.status)),
    facts([["所需职责", label(request.required_role)], ["有效期", request.expires_at], ["依据摘要", request.input_digest.value]]),
    candidate ? panel("本次候选内容", paragraph(candidate.body.goal ?? candidate.body.approach), details("查看完整约定 / 计划", candidate.body)) : paragraph("这是专业复核请求，请核对所引用的实际证据。"),
    request.risk_ref ? details("专业风险依据", intent.risk_assessments.find(risk => risk.id === request.risk_ref.id) ?? request.risk_ref) : null,
    details("请求与固定依据", request));
  if (item.status === "pending" && ordinary) result.append(form(values => {
    if (values.reviewed !== "on") throw new Error("请先查看本次候选内容及风险依据。");
    return mutation("RecordDecision", { request_id: request.id, input_digest: request.input_digest, choice: values.choice, reason: values.reason, conditions: lines(values.conditions) }, changeTarget(change), change.revision, request.required_role);
  }, select("choice", "决定", [["approve", "批准"], ["request_changes", "要求修改"], ["reject", "拒绝"]]), textarea("reason", "决定理由", { required: true }), textarea("conditions", "附带条件（每行一项，可留空）"),
  node("label", { class: "check" }, node("input", { name: "reviewed", type: "checkbox", required: true }), "我已核对本次候选内容和实际风险依据"), submit("记录决定")));
  if (item.status === "approve" && ordinary && decision) result.append(paragraph(`批准理由：${decision.reason}`),
    ...(decision.conditions.length ? [paragraph(`附带条件：${decision.conditions.join("；")}。应用前仍须满足条件核验。`)] : []),
    button(`应用已批准${request.action === "confirm_contract" ? "约定" : "计划"}`, () => mutation(request.action === "confirm_contract" ? "ConfirmContract" : "ConfirmPlan", {
      proposal_ref: request.target_ref, decision_request_ref: { object_type: "decision_request", id: request.id }, decision_ref: { object_type: "decision", id: decision.id }, input_digest: request.input_digest
    }, changeTarget(change), change.revision, request.required_role), "primary"));
  if (item.status === "pending" && !ordinary) result.append(paragraph("此专业决定需要原始复核报告。通过现有 CLI 导入并记录后，在本页刷新核对结果。"));
  if (decision) result.append(details("已记录的决定", decision));
  return result;
};
const inbox = data => {
  const items = data.items.flatMap(({ change, intent }) => intent.decision_requests.filter(item => ["pending", "approve"].includes(item.status)).map(item => decisionCard(change, intent, item)));
  return [...heading("决定收件箱", "核对本次候选与固定依据后记录决定。批准与应用分别形成事实。"), ...(items.length ? items : [panel("当前没有待处理决定", empty("当前请求均已处理，或尚未发起。过期与已应用的决定保留在需求详情中。"))])];
};
const taskPanel = (task, data) => {
  const definition = data.execution.definitions.find(value => value.id === task.definition_ref.id)?.body;
  const readiness = data.execution.readiness.find(value => value.task_id === task.id);
  const items = data.execution.work_items.filter(value => value.task_id === task.id);
  const active = items.find(value => value.id === task.active_work_item_ref?.id);
  const result = node("div", { class: "task" }, node("div", { class: "row" }, node("h3", {}, definition?.goal ?? task.id), badge(task.status), paragraph(label(definition?.purpose))),
    facts([["累计尝试", task.usage.attempts_consumed], ["已记录费用", !task.usage.cost_known ? "未知，待核对" : task.usage.cost_consumed_micros === undefined ? "数额尚未记录" : `${(task.usage.cost_consumed_micros / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${task.usage.cost_currency ?? "（币种未记录）"}`],
      ["授权准入", readiness?.ready ? "满足" : (readiness?.reasons ?? []).join("、") || "尚未评估"], ["当前授权", active?.id ?? "暂无"]]), details("任务与授权事实", { task, definition, readiness, work_items: items }));
  const run = data.runs.runs.find(value => value.id === task.active_run_ref?.id);
  if (run) result.append(node("div", { class: "row" }, paragraph("当前运行"), badge(run.status)), details("运行事实", run),
    form(values => mutation("CancelRun", { reason: values.reason }, { object_type: "run", id: run.id }, run.revision, "executor"), input("reason", "停止理由", { required: true }), submit("请求停止运行")));
  if (active) result.append(details("保存交接说明", {}));
  if (active) {
    const handoffForm = form(values => mutation("SaveHandoff", { source_snapshot_ref: { object_type: "source_snapshot", id: values.source },
      ...(run ? { run_ref: { object_type: "run", id: run.id } } : {}), next_actor_ref: { object_type: "actor", id: values.actor }, completed: lines(values.completed),
      unresolved: lines(values.unresolved), next_action: values.next_action, evidence_refs: [] }, { object_type: "work_item", id: active.id }, active.revision, "executor"),
      select("source", "交接基于的源码快照", [["", "选择已记录的快照"], ...data.verification.source_snapshots.map(source => [source.id, source.commit_id.slice(0, 12)])]),
      select("actor", "接续者", actors(), state.context.actor_id), textarea("completed", "已完成事项（每行一项）"), textarea("unresolved", "待处理事项（每行一项）"),
      textarea("next_action", "下一步", { required: true }), submit("保存交接"));
    handoffForm.querySelector('[name="source"]').required = true;
    result.lastChild.replaceChildren(node("summary", {}, "保存交接说明"), paragraph("实际工作区、累计用量和固定依据由 Kernel 采集并核对。"), handoffForm);
  }
  const handoffs = data.runs.handoffs.filter(value => value.task_id === task.id);
  for (const handoff of handoffs) result.append(panel("已保存交接", facts([["接续者", actorName(handoff.next_actor_ref.id)], ["下一步", handoff.next_action]]),
    paragraph(`已完成：${handoff.completed.join("；") || "暂无"}`), paragraph(`待处理：${handoff.unresolved.join("；") || "暂无"}`), details("固定交接记录", handoff)));
  return result;
};
const contractForm = change => form(values => mutation("SubmitContractProposal", { base_version_ref: change.contract_ref ?? null, body: {
  goal: values.goal, scope: values.scope, non_goals: lines(values.non_goals), constraints: lines(values.constraints),
  acceptance_criteria: [{ key: "A1", scenario: values.scenario, expected: values.expected, evidence_requirements: lines(values.evidence) }],
  delivery_endpoint: "production_verified", knowledge_impact: [], risk: { level: values.risk, impact_categories: ["other"], rationale: values.rationale }, unresolved_questions: lines(values.questions)
} }, changeTarget(change), change.revision, "change_owner"), input("goal", "期望结果", { required: true }), textarea("scope", "本次范围", { required: true }),
textarea("non_goals", "不包含的工作（每行一项）"), textarea("constraints", "约束（每行一项）"), input("scenario", "验收场景", { required: true }), input("expected", "预期行为", { required: true }),
textarea("evidence", "验收需要的证据（每行一项）", { required: true }), select("risk", "风险等级", [["ordinary", "普通"], ["high", "高风险"]]), textarea("rationale", "风险说明", { required: true }),
textarea("questions", "尚未明确的问题（每行一项）"), paragraph("此简表适用于一项验收、无知识影响、other 风险类别的普通候选；多验收项、知识影响或其他风险类别请使用已有 CLI 提交完整候选。"), submit("提交约定候选"));
const changePage = data => {
  const { intent, execution, runs, verification } = data, change = intent.change;
  const proposals = intent.contract_proposals.filter(proposal => !intent.decision_requests.some(item => item.request.target_ref.id === proposal.id));
  return [...heading(`${change.display_key} · ${change.title}`, "任务、决定和交接均引用当前项目的实际记录。"),
    panel("当前需求", node("div", { class: "row" }, badge(change.lifecycle_state), badge(change.operating_status)),
      facts([["推进负责人", actorName(change.owner_actor_id)], ["需求负责人", actorName(change.requirement_owner_actor_id)], ["当前版本", change.revision], ["约定版本", change.contract_ref?.domain_version], ["计划版本", change.plan_ref?.domain_version]]),
      change.operating_status === "Active" ? form(values => mutation("PauseChange", { reason: values.reason }, changeTarget(change), change.revision, "change_owner"), input("reason", "暂停理由", { required: true }), submit("暂停需求")) :
      button("核对并恢复推进", () => mutation("ResumeChange", {}, changeTarget(change), change.revision, "change_owner")), details("当前需求事实", change)),
    panel("约定与实施计划", [...intent.contract_versions, ...intent.plan_versions].map(version => details(`${version.proposal_ref.object_type === "contract_proposal" ? "约定" : "计划"}版本 ${version.version}`, version.body)),
      change.plan_ref && execution.tasks.length === 0 ? button("按已确认计划初始化任务", () => mutation("InitializePlanTasks", { plan_ref: change.plan_ref }, changeTarget(change), change.revision, "technical_owner")) : null,
      change.lifecycle_state === "IntentReady" && change.plan_ref ? form(values => mutation("StartChange", { plan_ref: change.plan_ref, opening_reason: values.reason }, changeTarget(change), change.revision, "flow_owner"), input("reason", "开工说明", { required: true }), submit("开始实施")) : null,
      intent.contract_proposals.length ? details("约定候选历史", intent.contract_proposals) : null, intent.plan_proposals.length ? details("计划候选历史", intent.plan_proposals) : null,
      node("details", {}, node("summary", {}, "提交普通约定候选"), contractForm(change)),
      proposals.map(proposal => {
        const risk = intent.risk_assessments.find(value => value.subject_refs.some(ref => ref.id === proposal.id && ref.domain_version === proposal.proposal_revision));
        const ref = { object_type: "contract_proposal", id: proposal.id, domain_version: proposal.proposal_revision };
        return risk ? button("请求确认当前约定候选", () => mutation("RequestDecision", { action: "confirm_contract", proposal_ref: ref, risk_ref: { object_type: "risk_assessment", id: risk.id } }, changeTarget(change), change.revision, "change_owner")) :
          form(values => mutation("RecordRiskAssessment", { proposal_ref: ref, level: values.level, rationale: values.rationale }, changeTarget(change), change.revision, "technical_owner"),
            select("level", "专业风险判断", [["ordinary", "普通"], ["high", "高风险"]]), textarea("rationale", "实际检查依据", { required: true }), submit("记录风险判断"));
      })),
    panel("任务与运行", execution.tasks.length ? execution.tasks.map(task => taskPanel(task, data)) : empty("当前计划尚未初始化任务。可通过现有 CLI 继续准备计划与授权。")),
    ...intent.decision_requests.map(item => decisionCard(change, intent, item)),
    panel("验证与接续", verification.evaluations.length ? verification.evaluations.map(value => details(`评价：${value.outcome}`, value)) : empty("尚无任务或集成评价。"),
      ["IntentReady", "Executing"].includes(change.lifecycle_state) ? form(values => mutation("CaptureSourceSnapshot", { commit_id: values.commit }, changeTarget(change), change.revision, "technical_owner"),
        input("commit", "需要记录的固定 Git commit", { required: true, pattern: "(?:[0-9a-f]{40}|[0-9a-f]{64})", placeholder: "完整 commit ID；由 Kernel 核验当前仓库实际内容" }), submit("记录源码快照")) : null,
      runs.resumptions.map(value => details("接续核对", value)), details("源码与验证事实", verification))];
};
const load = async () => {
  if (!state.context) return;
  const generation = ++state.loading;
  const dashboardData = await api("/api/dashboard");
  const route = location.hash.slice(1) || "dashboard", change = /^change\/(.+)$/.exec(route);
  const data = change ? await api(`/api/changes/${encodeURIComponent(decodeURIComponent(change[1]))}`) : route === "decisions" ? await api("/api/decisions") : null;
  if (generation !== state.loading) return;
  state.dashboard = dashboardData; state.view = change ? "change" : route; state.changeId = change ? decodeURIComponent(change[1]) : null; state.detail = data;
  document.querySelector("#project-name").textContent = dashboardData.project.name;
  document.querySelector("#operator").textContent = `${actorName(state.context.actor_id)} · 本地 Human`;
  document.querySelectorAll("nav a").forEach(link => link.classList.toggle("active", link.dataset.view === state.view || (state.view === "change" && link.dataset.view === "pool")));
  const page = state.view === "pool" ? pool() : state.view === "decisions" ? inbox(data) : state.view === "change" ? changePage(data) :
    ["releases", "environments"].includes(state.view) ? [...heading(state.view === "releases" ? "发布批次" : "环境概览", "此入口将在发布与生产交付阶段接通。"), panel("尚未实施", paragraph("当前工作台覆盖需求、任务、决定与交接。这里尚无可执行的发布或环境操作。"))] : dashboard();
  content.replaceChildren(...page);
};
document.querySelector("#refresh").addEventListener("click", () => { void load().catch(showError); });
window.addEventListener("hashchange", () => { void load().catch(showError); });
try {
  const bootstrap = location.hash.slice(1);
  if (/^[A-Za-z0-9_-]{43}$/.test(bootstrap)) {
    history.replaceState(null, "", "/"); await api("/api/session", { bootstrap });
  }
  state.context = await api("/api/context");
  const pending = sessionStorage.getItem(`cimiloop.pending.${state.context.project_id}`);
  if (pending) state.pending = JSON.parse(pending);
  await load();
  if (state.pending) showNotice("上次动作的结果尚未核对。已保留原请求，请先核对再继续写入。", true, button("按原请求核对", replay), details("保留的动作请求", state.pending));
} catch (error) {
  content.replaceChildren(...heading("暂时无法连接项目", "请从终端重新启动工作台，浏览器将建立新的本地会话。"), panel("连接结果", paragraph(error.message)));
}
