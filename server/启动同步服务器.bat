@echo off
chcp 65001 >nul
title 物料管家同步服务器
cd /d %~dp0

echo.
echo   正在启动物料管家同步服务器……
echo   （启动后不要关闭本窗口；局域网设备用下面显示的地址访问）
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [出错] 这台电脑没有安装 Node.js，无法启动服务器。
  echo.
  echo   解决办法：
  echo     1. 打开 https://nodejs.org 下载 LTS 版本安装（一直点下一步即可）
  echo     2. 装好后再双击本文件
  echo.
  echo   不想装 Node？也完全可以：把整个系统文件夹拷给同学，
  echo   大家各自单机使用即可（数据各自保存在自己浏览器里）。
  echo.
  pause
  exit /b 1
)

node server.js
echo.
echo   服务器已停止。
pause
