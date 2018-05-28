---
title: "从零构建一个容器"
date: 2018-05-23T18:11:45+08:00
lastmod: 2018-05-23T18:11:45+08:00
categories: [Container]
---

## Background

这是基于 Liz Rice 在 Container Camp 的会议分享，Liz 在不到 20 分钟的时间里，用 100 行左右的 Golang 代码，构建了一个容器。分享链接为[Building a container from scratch in Go](https://www.youtube.com/watch?v=Utf-A4rODH8)。

## Rootfs

Liz 在用到文件系统时，展示了她虚拟机上的 `/home/rootfs`，说了句 "I just happen to have one lying around"。通常我们自己的 Linux 系统中并没有这么个目录，不过从视频的评论中可以找到一些相关链接，能够帮忙我们了解并构建一个 chroot。

* Ubuntu 帮助文档 - [BasicChroot](https://help.ubuntu.com/community/BasicChroot)
* TLDP 文章 - [Building a root filesystem](http://www.tldp.org/HOWTO/Bootdisk-HOWTO/buildroot.html)

我参考 Ubuntu-BasicChroot 的 Creating a chroot 章节操作了下，略需注意，文档中的 `Lucid` 版本太过陈旧，应该根据实际情况选择ubuntu的版本。Ubuntu 下步骤简述如下：

```bash
# 1. `apt` 安装 `schroot` 和 `debootstrap`;
apt install schroot debootstrap

# 2. 修改 `schroot` 配置 `/etc/schroot/schroot.conf`，新增下文配置;
[xenial] # 合适的版本，这里选 16.04 的 Xenial Xerus
description=Ubuntu Xenial
location=/home/rootfs # 你期望的地址
priority=3
users=root
groups=sbuild
root-groups=root

# 3. 使用 `debootstrap` 命令在指定目录下载系统文件，选清华的镜像；
sudo debootstrap --variant=buildd --arch i386 xenial /home/rootfs https://mirrors.tuna.tsinghua.edu.cn/ubuntu/
```

## Container from scratch 

Liz Rice 的代码见Gist： [Container from scratch](https://gist.github.com/lizrice/a5ef4d175fd0cd3491c7e8d716826d27)

基于代码，可以对容器就是“Namespace 和 Cgroup”有个更直接的理解。Namespace 决定了你能看到什么，而 Cgroup，决定了你能用那些资源（代码中没有明确展示）。
