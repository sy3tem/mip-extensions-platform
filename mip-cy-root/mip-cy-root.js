/**
 * @file mip-cy-root 组件
 * @author 春雨前端开发组
 */

define(function (require) {
    'use strict';

    var customElement = require('customElement').create();

    customElement.prototype.build = function () {
        flexible();
    };

    /**
    * 可伸缩布局方案
    * rem计算方式：设计图尺寸px / 100 = 实际rem  例: 100px = 1rem
    */
    function flexible() {
        // 设计图文档宽度
        var designIndex = 3.75;
        var doc = window.document;
        var docEl = doc.documentElement;
        var resizeEvt = 'orientationchange' in window ? 'orientationchange' : 'resize';
        var recalc = (function refreshRem() {
            var clientWidth = docEl.getBoundingClientRect().width;
            // 85.3：小于320px不再缩小，112：大于420px不再放大
            docEl.style.fontSize = Math.max(Math.min((clientWidth / designIndex), 112), 85.3) + 'px';
            return refreshRem;
        })();

        // 添加倍屏标识，安卓倍屏为1
        docEl.setAttribute('data-dpr', window.navigator.appVersion.match(/iphone/gi) ? window.devicePixelRatio : 1);
        if (/iP(hone|od|ad)/.test(window.navigator.userAgent)) {
            // 添加IOS标识
            doc.documentElement.classList.add('ios');
            // IOS8以上给html添加hairline样式，以便特殊处理
            if (parseInt(window.navigator.appVersion.match(/OS (\d+)_(\d+)_?(\d+)?/)[1], 10) >= 8) {
                doc.documentElement.classList.add('hairline');
            }
        }

        if (!doc.addEventListener) {
            return;
        }

        window.addEventListener(resizeEvt, recalc, false);
        doc.addEventListener('DOMContentLoaded', recalc, false);
    }

    return customElement;
});
