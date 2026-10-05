# Runtime adapter

V1-09先行验证包，只运行独立合成探针。当前后端为Windows x64 AppContainer / Job；正式Provider绑定、Agent Run、费用 / 网络边界及崩溃恢复仍待完成。不得把探针成功转换为Task满足或Gate批准。

`runOpenCodeProbe`固定原生二进制副本及版本，检查写入 / 只读OS边界；显式启用模型探针时尝试真实合成修改和独立只读会话。`IsolatedProbeAdapter`提供持久操作键的`start/query/cancel/collect`，仅接受`isolated_provider_probe`作用域。`native_contract_fixture`用于实际OS控制测试，不是正式Runtime或业务证据。

`--connection-file`支持专用智谱Coding Plan / 普通API配置，只接受固定官方端点、模型及DPAPI加密凭据引用。可信控制端核对摘要、解密并注入单次运行环境；管道跨块Key遮盖使观测进入Unknown，正常结束删除私有Runtime状态。人类登录、Key明文、任意端点和配置不进入探针输入。

实际OpenCode 1.18.34的Zen首批403与后续智谱GLM-5.3双会话通过均保留事实，详见[Runtime探针与隔离](../../docs/implementation/CimiLoop-Runtime探针与隔离-v0.1.md)。构建后可通过CLI的`runtime probe/show/cancel/collect`入口使用；本包不读写Project权威数据库，探针通过不启用正式Agent Run。
