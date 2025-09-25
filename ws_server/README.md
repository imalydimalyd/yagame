# WS交换机使用说明

## 安装方法

首先需要一台云服务器。安装Node.js和配套的包管理器（例如npm），然后用包管理器安装`express`和`express-ws`这两个包。

## 启动命令

```
nohup env DEBUG=express:* node main.js > output.log 2>&1 &
```

## 修改配置

直接打开`main.js`修改：

- `useCert`：`true`为HTTPS（需要提供SSL证书路径），`false`为HTTP（无需SSL证书）
- `pathToKey`：私钥文件路径，只有当`useCert=true`时需要填写
- `pathToCert`：证书文件路径，只有当`useCert=true`时需要填写
