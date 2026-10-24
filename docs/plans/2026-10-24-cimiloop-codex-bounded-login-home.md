# 正式Codex组合的固定卷登录根

基线253e589。上一轮有实际修复和本地提交，不是无进展等待。本批补V1-09正式组合中仍在系统登录根的写入路径；五组S1范围不缩小，模型与费用许可、独立资格及原Run权威保持。

## 选择与边界

保留现有登录根不能约束其其他写入；复制令牌到卷内违反当前凭据要求。因此选择用户在仓库外专用固定卷目录用官方CLI独立登录同一已批准账号，再显式绑定该目录。产品只读取官方account/read及额度元数据，不读取、散列、复制或记录auth.json；没有额外API服务或模型请求。不同账号／额度账号拒绝，原安装不被改写。

`CODEX_HOME`和`cli_auth_credentials_store=file`的配置语义已核对[官方认证文档](https://learn.chatgpt.com/docs/auth)及[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。系统管理要求可覆盖用户设置。现有config/read返回完整、可扩展配置，不能为核对一个字段而把潜在秘密放入原字节账本。本批不调用该接口；固定实际子进程环境和CLI参数，实际存储后端／全写路径的独立OS验证仍作为完整Runtime验收条件，不能据参数自报通过。

## 实施

1. 真正FixedVolumeRuntimeStorage能力可独立核对额外路径，仍读取同一原Host／卷政策，伪造JSON或替换公开assertPath不构成能力。
2. 新仓库外登录根附着于原安装和固定卷票。目录必须已存在，位于同一原卷、原项目／数据根之外；目录物理身份、Host／安装／当前项目固定。安装前后核对，原意图先登记，登录检查失败留下pending，不补票、不自动重试登录检查。查询只读原登记，不打开登录，不创建目录／程序／账户。
3. 新传输start9固定登录目录及物理身份、私有状态策略2；新Agent header15继承普通／父Skill header8协议。发送前后守卫核对原目录，子环境移除所有大小写CODEX_HOME别名再设置新值。旧header1—14／start1—8按原件重放，不迁移或重解释；历史查询不要求登录目录仍存在。
4. 默认正式工厂和共享组合必须消费真实能力。未绑定／pending／丢失则拒绝，不能回退当前桌面登录；原已派发Run的只读恢复不新建登录根或重发模型。
5. CLI显式安装／只读查询与接入指南连通；先失败反例，再实现、受影响整文件、check、独立工程复查和本地提交，不push。PUBLIC子进程和卷投影不是实际登录／物理配额／S1证据。

真实前置条件仍待用户：管理员准备新专用固定卷的prepared.json、在该卷的仓库外私有目录用官方CLI登录同一账号。产品代码与受控集成可先完成；最终真实验收不把缺项算通过。Schema242／库10／Host1不变。

## 实际接入步骤

以下登录与正向绑定尚待真实固定卷；不要把这些待执行步骤写成已通过。先按[固定卷准备记录](2026-10-23-cimiloop-fixed-volume-quota.md)取得管理员新卷及prepared.json，在该卷建立新验收Repository并完成现有`runtime install-codex`、`install-codex-budget`、`install-codex-storage`。不迁移当前用户库。以下R盘必须替换为该prepared.json中的实际新卷。

在普通Runtime用户的新PowerShell窗口，用新UUID创建仓库外目录，只配置这个新目录的权限。`$runtimeProject`填新卷内的已初始化验收项目；不把目录放到其内部。

```powershell
$runtimeProject = 'R:\CimiS1Project'
$runtimeLoginHome = Join-Path 'R:\' ('CimiLoopLogin-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runtimeLoginHome -ErrorAction Stop | Out-Null
$runtimeUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls $runtimeLoginHome /inheritance:r /grant:r "*${runtimeUserSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F'
if ($LASTEXITCODE -ne 0) { throw '新登录目录权限配置失败；保留目录，不进行登录' }
$previousCodexLoginRoot = $env:CODEX_HOME
try {
  $env:CODEX_HOME = $runtimeLoginHome
  codex -c 'cli_auth_credentials_store="file"' -c 'history.persistence="none"' login
  if ($LASTEXITCODE -ne 0) { throw '官方Codex登录未完成；不要复制现有令牌' }
} finally {
  if ($null -eq $previousCodexLoginRoot) { Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue }
  else { $env:CODEX_HOME = $previousCodexLoginRoot }
}
```

只在官方登录页面选择已批准的同一账号／工作区。这里临时改变专用PowerShell子进程环境，不使用setx、不更改Codex桌面进程的环境，不读取任何凭据文件。管理员强制策略若不允许file存储，应报告拒绝，不复制令牌绕过。

随后从当前开发检出的根目录执行新入口；换电脑必须改为实际检出位置，不能依赖旧绝对路径。

```powershell
node apps/cli/dist/bin.js runtime install-codex-home --project-dir $runtimeProject --home $runtimeLoginHome --yes --json
node apps/cli/dist/bin.js runtime codex-home --project-dir $runtimeProject --json
```

首次安装只发initialize／account/read／额度查询，不启动线程或模型。成功后查询返回installed，但`credential_storage_proven:false`和`provider_qualification_proven:false`保持。pending／unavailable退出码1，须保留原目录及Host登记；不要删票、改盘符或以重复安装重开检查。现有已派发Run仍从原启动入口只读恢复，不拿新目录替代旧Run。

提供给后续验收的资料只有prepared.json绝对路径和本次新登录目录绝对路径；不要发送API Key、认证文件、令牌或登录日志。真实账单来源仍单独缺失，included额度／token／estimatedUsage不能据此结清费用。

## 已执行与证据边界

本机真实Codex原生程序在新建空登录目录`D:/CimiS1/codex-empty-home-fkDugV/home`上执行元数据检查，返回`codex_chatgpt_login_required`，未透出桌面登录。驱动没有线程／模型请求，也没有读取凭据文件。原程序摘要及结果保留在`.cimiloop/codex-2026-10-22/codex-login-home-no-login.json`。这不是已登录目录、真实模型、AppContainer或物理配额正向验收，不证明管理策略下的全部凭据存储行为。

应用夹具首次用错原生模块路径，修正后先复现七项缺入口失败；后续六项失败由夹具非法Host命名`PUBLIC-read`引起，改成合法命名后七项整文件通过。九文件集中回归中的该旧失败报告保留，不把它算作整轮通过。模型文件两次各有一项在10秒PUBLIC传输夹具期限关闭，失败点分别是命名结果工具响应、历史header14末账户查询；另一轮中的相应用例已通过。只将该Windows夹具等待期限调为30秒、测试期限60秒，不改变正式生产Task／Run／传输预算；随后整文件复验结果另记。实际根因不被扩写成已修复Native或历史Bun故障。

## 最终受影响回归

分阶段执行十个完整文件194项通过、0失败0跳过；每个文件取其最终完整结果，不合并不同运行的单个成功用例，不重复计数。最初九文件集中回归有失败，不能称为一次十文件全绿。`codex-login-home-validation-summary.json`列出对应报告、最终文件结果及本次源码／编译产物摘要。

| 完整文件 | 通过 |
| --- | ---: |
| runtime-adapter／agent-codex-model | 46 |
| runtime-adapter／codex-runtime-state | 14 |
| runtime-adapter／fixed-volume-policy | 19 |
| runtime-adapter／codex-original-method | 28 |
| runtime-adapter／codex-ordinary-quota | 42 |
| runtime-adapter／codex-login-inspection | 7 |
| local-app／agent-codex-login-home | 7 |
| local-app／agent-runtime-admission-local | 15 |
| local-app／agent-parent-skill-composition | 9 |
| cli／codex-runtime-installation | 7 |

最终Node24.22.1／pnpm12.4.2、`pnpm check`通过。独立工程复查本批代码未发现可操作问题；这是本批工程复查，不是完整Matt／最终Superpowers或S1验收。CLI帮助、文档UTF-8／围栏／相对链接及`git diff --check`通过。无新增真实模型／AppContainer执行，未运行全仓测试；历史Native失败、Unknown和原预算没有被本次通过结清。

当前真实完整准入宿主仍未安装：默认工厂对登录目录的消费已经实现，不能把缺完整Host接口、真实账户／费用和独立行为资格视作仅填写目录即可通过。真实固定卷满盘／写路径验证、账单、真实Skill、待Human回答的原Matt会话及真实Change交付继续，五组目标保持。
