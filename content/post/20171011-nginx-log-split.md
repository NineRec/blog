---
categories: Nginx
date: 2017-10-11T00:00:00Z
title: Nginx 日志切分
url: /post/nginx-log-split/
---

### 抛出问题

Nginx 的 `access_log & error_log`，在漫长的岁月中不断增长。然而 nginx 日志并没有 rotate 功能。如果简单百度、Bing下，会发现在 N 多博客中，大家都在说写个定时脚本，然后通过脚本定时重命名日志、向 Nginx 主进程发送 USR1 信号，让 Nginx 重新加载日志文件，从而达到切割日志的效果。

这样的操作难免需要动手的部分太多，而且考虑到其他如日志压缩、定期删除日志等，工作量也还不少。

这里应该有更舒适的办法。

### 找到答案

其实这时候就是体现不同的搜索引擎在解决技术问题时的能力了。Google 简单搜索了下，找到了如下文章： [How To Configure Logging and Log Rotation in Nginx on an Ubuntu VPS](https://www.digitalocean.com/community/tutorials/how-to-configure-logging-and-log-rotation-in-nginx-on-an-ubuntu-vps)

关注 `Log Rotation` 那段，可以发现一个很好用的工具 `logrotate`。简单在系统安装后，应该是自带了 Nginx 日志切割的配置文件，根据自己的环境简单配置后，每日就可以安心的看到切分好的日志了，而且还会删掉 N 天前的日志，也不用担心磁盘爆了。

我的配置：

```
/var/log/nginx/*log {
    create 0644 nginx nginx
    daily
    rotate 10
    missingok
    notifempty
    compress
    sharedscripts
    postrotate
        /bin/kill -USR1 `cat /run/nginx.pid 2>/dev/null` 2>/dev/null || true
    endscript
}
```
