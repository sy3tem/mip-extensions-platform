/**
 * @file 无限下拉组件
 * @author  wangpei07
 * @date 2017-02-15
 */

define(function (require) {
    // 使用了jquery $.Deferred
    var util = require('util');
    var $ = require('jquery');
    var viewport = require('viewport');
    var InfiniteScroll = function (opt) {
        if (!opt.$result || !opt.$loading || !opt.pushResult) {
            return;
        }

        var me = this;

        opt.$result = $(opt.$result);
        opt.$loading = $(opt.$loading);
        opt.$ele = opt.ele;

        // 设置默认值
        me.options = $.extend({
            $wrapper: $(window), // 视窗
            $scroller: $('body'), // 滚动容器
            firstResult: [], // firstResult支持可选
            scrollPageClass: 'mip-infinitescroll-page', // 内容列表每页className
            loadingHtml: '加载中...',
            loadFailHtml: '加载失败,点击重试',
            loadOverHtml: '加载完毕',
            bufferHeightPx: 10,
            pageResultNum: 10,
            limitShowPn: 2,
            preLoadPn: 1
        }, opt);

        me.init();
    };

    InfiniteScroll.prototype = {

        version: '0.1.0',

        init: function () {
            var me = this;

            me.eventSpace = '.InfiniteScroll';
            me.state = 'start'; // 标识状态 start-执行 pause-暂停
            me.scrollPageCache = { // 每页结果缓存
                topPosition: [], // 结果位置
                content: [] // 结果内容
            };
            me.dataStatus = 1; // 外部数据状态 0-无数据 1-默认(数据情况未知) 2-请求中 3-请求失败(网络原因)
            me.currentLoadPage = (me.options.firstResult.length) ? 0 : -1; // 当前加载页码,firstResult存在0,否则-1
            me.currentShowPage = 0; // 当前用户可视区页码

            // 执行横屏补丁
            me.horizontalHack();

            // 处理loading区域内容
            me.options.$loading.html(me.options.loadingHtml);
            // 如果firstResult存在,同步加载第0页内容
            if (me.options.firstResult.length) {
                me.scrollPageCache.content = me.scrollPageCache.content.concat(me.separatePage(me.options.firstResult));
                me.options.$result.html(me.wrapPageParentDom(me.scrollPageCache.content[0], 0));
                me.scrollPageCache.topPosition.push(me.options.$result.position().top);
            }

            // 初始化全局环境变量 && resize时重新获取环境变量
            me.refresh();
            $(window).on('resize' + me.eventSpace, function () {
                me.refresh();
            });

            // 翻滚吧
            me.bindScroll();

            // 如果firstResult不存在,调用scrollBottomFn方法异步加载首屏数据
            if (!me.options.firstResult.length) {
                me.scrollBottomFn();
            }

        },

        /**
         * 重新获取环境变量
         */
        refresh: function () {
            var me = this;

            // 若为暂停状态,什么也不做
            if (me.state === 'pause') {
                return;
            }

            me.wrapperHeight = me.options.$wrapper.height(); // 可视区高度
            me.scrollerHeight = this.getScrollerHeight(); // 滚动容器高度
            me.currentScrollTop = me.options.$wrapper.scrollTop(); // 当前滚动条位置
        },

        /**
         * destroy方法
         */
        destroy: function () {
            var me = this;

            $(window).off('resize' + me.eventSpace); // 注销resize事件
            me.options.$loading.off('click' + me.eventSpace); // 注销loading上的点击事件
            viewport.off('scroll', me.scrollHandler);
            me.scrollPageCache = null; // 删除cache数据
        },

        /**
         * pause方法,外部接口,用于暂停infiniteScroll
         */
        pause: function () {
            var me = this;

            // 若已经为暂停状态,什么也不做
            if (me.state === 'pause') {
                return;
            }

            // 记录当前滚动位置
            me.pauseScrollTop = me.currentScrollTop;
            me.state = 'pause';
        },

        /**
         * start方法,外部接口,用于恢复infiniteScroll
         */
        start: function () {
            var me = this;

            // 若已经为执行状态,什么也不做
            if (me.state === 'start') {
                return;
            }

            // 恢复滚动位置
            me.options.$wrapper.scrollTop(me.pauseScrollTop);
            me.refresh();
            me.state = 'start';
        },

        /**
         * 横屏hack
         * 为保证横屏下滚动容器定位,横竖屏结果高度必须相同
         * 目前百度栅格系统采用流式布局,因此强制横屏下父容器宽度与竖屏相同
         */
        horizontalHack: function () {
            var me = this;

            var verticalScreenWidth;
            if (window.orientation !== undefined) {
                // 安卓某些系统下screen返回的是高分屏尺寸...
                if (window.orientation === 0 || window.orientation === 180) {
                    // 竖屏
                    verticalScreenWidth = Math.min(window.screen.width, $(window).width());
                }
                else if (window.orientation === 90 || window.orientation === -90) {
                    // 横屏
                    verticalScreenWidth = Math.min(window.screen.width, window.screen.height);
                    var winScreen = Math.max(window.screen.width, window.screen.height);
                    verticalScreenWidth = verticalScreenWidth * $(window).width() / winScreen;
                }
            }
            else {
                // 为防止极个别情况不支持orientation属性(目前未发现)
                // 当不支持orientation且返回高分屏尺寸时,这里会出bug
                verticalScreenWidth = Math.min(window.screen.width, window.screen.height);
            }
            me.options.$result.css({
                'max-width': verticalScreenWidth + 'px'
            });
        },

        bindScroll: function () {
            var me = this;
            var scrollHandler;
            viewport.on('scroll', function scrollHandler() {
                // 若为暂停状态,什么也不做
                if (me.state === 'pause' || !me.isElementInViewport()) {
                    return;
                }

                // 获取当前滚动条位置
                me.currentScrollTop = viewport.getScrollTop();
                // 某些浏览器(安卓QQ)滚动时会隐藏头部但不触发resize,需要反复获取 wtf...
                me.wrapperHeight = viewport.getHeight();
                // 获取容器高度
                me.scrollerHeight = viewport.getScrollHeight();

                // 到顶了
                if (me.currentScrollTop <= 0) {
                    // 执行回调
                    me.options.onScrollTop && me.options.onScrollTop.call(me);
                }

                // 到底了
                if (me.currentScrollTop >= me.scrollerHeight - me.wrapperHeight - me.options.bufferHeightPx) {
                    me.scrollBottomFn();
                    // 执行回调
                    me.options.onScrollBottom && me.options.onScrollBottom.call(me);
                }

                // 获取当前可视区页码
                var currentShowPage = me.getShowPage();
                // 若页码变化
                var onChanPn = me.options.onChangeShowPN;
                if (me.currentShowPage !== currentShowPage) {
                    // 执行回调
                    onChanPn && onChanPn.call(me, currentShowPage, me.currentShowPage);
                    me.currentShowPage = currentShowPage;
                    // 清理or回填dom
                    if (me.options.limitShowPn) {
                        me.cycleScrollElement(currentShowPage);
                    }
                }

            });

            // 若初始即不满一屏,trigger scroll事件触发加载
            if (me.currentScrollTop >= me.scrollerHeight - me.wrapperHeight - me.options.bufferHeightPx) {
                viewport.trigger('scroll');
            }

            this.scrollHandler = scrollHandler;
        },

        /**
         * 当滚动条滚动到页面底部时执行
         */
        scrollBottomFn: function () {
            var me = this;

            var pn = me.currentLoadPage + 1; // 需要加载的页码(从0计)
            var dn = me.scrollPageCache.content.length - 1; // 已有数据最大页码(从0计)

            // 还有数据
            if (pn <= dn) {
                // 有你就刷，别废话！
                me.updateScrollElement(pn);
                // 执行回调
                me.options.onLoadNewPage && me.options.onLoadNewPage.call(me, pn);
            }

            // 数据不够 && 数据状态为默认(!无数据 && !请求中 && !请求失败)
            if (me.dataStatus === 1 && pn + me.options.preLoadPn >= dn) {
                // 调用cb:pushResult请求新数据,由于数据请求一般为异步,使用标准Deferred对象处理(同时也兼容同步数据返回)
                var dataDeferred = me.options.pushResult.call(me, (dn + 1) * me.options.pageResultNum, dn - pn);
                // 标记数据状态为请求中
                me.dataStatus = 2;
                $.when(dataDeferred).then(
                    // 成功
                    function (newResultArr) {
                        // 处理新增数据
                        if (newResultArr.length === 0 || newResultArr === 'NULL') {
                            // 标记数据状态为无数据
                            me.dataStatus = 0;
                            me.options.$loading.html(me.options.loadOverHtml);
                        }
                        else if (newResultArr.length) {
                            // 标记数据状态为默认
                            me.dataStatus = 1;
                            // 将新数据合并入数据缓存中
                            var meScrollContent = me.scrollPageCache.content;
                            me.scrollPageCache.content = meScrollContent.concat(me.separatePage(newResultArr));
                            // trigger scroll事件,确保继续触发数据加载
                            viewport.trigger('scroll');
                        }

                        // 失败
                    }, function () {
                        // 标记数据状态为请求失败
                        me.dataStatus = 3;
                        me.options.$loading.html(me.options.loadFailHtml).one('click' + me.eventSpace, function () {
                            // 标记数据状态为默认
                            me.dataStatus = 1;
                            me.options.$loading.html(me.options.loadingHtml);
                            // trigger scroll事件,重新触发数据加载
                            viewport.trigger('scroll');
                        });
                    }
                );
            }

        },

        /**
         * 按页更新滚动元素内容
         *
         * @param  {integer} pn 页码
         */
        updateScrollElement: function (pn) {
            var me = this;

            var $domNewPage = $(me.wrapPageParentDom(me.scrollPageCache.content[pn], pn));
            me.options.$result.append($domNewPage);

            // 更新变量
            me.currentLoadPage = pn;
            me.scrollerHeight = this.getScrollerHeight();
            me.scrollPageCache.topPosition.push($domNewPage.position().top);
        },
        getScrollerHeight: function () {
            return viewport.getScrollHeight();
        },

        /**
         * 清理&恢复dom方法
         * IP:[number]当前可视区页码
         * 由于wise性能较差，需要清理掉滚动到可视区外的元素
         *
         * @param  {integer} pn 页码
         */
        cycleScrollElement: function (pn) {
            var me = this;

            var recycleClass = 'infinite-recycle';
            var startPage = Math.max(pn - Math.floor((me.options.limitShowPn - 1) / 2), 0);
            // 获取所有结果列表dom
            var $domResultElement = me.options.$result.find('.' + me.options.scrollPageClass);
            // 选出当前需要被显示的dom页
            var $domShouldShowElement = $domResultElement.slice(startPage, startPage + me.options.limitShowPn);

            // todo:这里应该还有优化空间
            if ($domShouldShowElement.length) {
                // 恢复:在应该被显示的dom中选出所有带回收标记标签的元素执行恢复操作
                $domShouldShowElement.each(function () {
                    if ($(this).hasClass(recycleClass)) {
                        $(this).html(me.scrollPageCache.content[$(this).attr('data-page')]);
                        $(this).removeClass(recycleClass);
                    }

                });
                // 清理:选出所有不应该被显示的dom,并排除已有回收标记标签的元素,执行清理操作
                $domResultElement.not($domShouldShowElement).not('.' + recycleClass).each(function () {
                    $(this).height($(this).height()).empty();
                    $(this).addClass(recycleClass);
                });
                // 这里有可能导致整体高度变化,需要重新更新高度
                me.scrollerHeight = this.getScrollerHeight();
            }

        },

        /**
         * 将结果处理成分页的数组结构返回
         * IP:[arr]结果列表html代码片段
         * OP:[arr]按页分割的html代码片段
         *
         * @param  {Array} listArr 结果
         * @return {Array}   html array
         */
        separatePage: function (listArr) {
            var me = this;

            if (!listArr.length || listArr === 'NULL') {
                return;
            }

            var pageResultNum = me.options.pageResultNum; // 每页结果数
            var pageNum = Math.ceil(listArr.length / pageResultNum); // 分成x页
            var pageHtmlArr = [];
            for (var i = 0; i < pageNum; i++) {
                pageHtmlArr.push(listArr.slice(i * pageResultNum, i * pageResultNum + pageResultNum).join(''));
            }
            return pageHtmlArr;
        },

        /**
         * 为每页内容包裹父容器
         * IP:html-[string]一页的html代码片段;pn-[number]当前页码
         * OP:[string]按页包裹完每页父容器的html代码
         *
         * @param  {string} html html
         * @param  {integer} pn 页码
         * @return {string}   拼接好的html
         */
        wrapPageParentDom: function (html, pn) {
            var me = this;

            return (
            [
                '<ul class="' + me.options.scrollPageClass + '" data-page="' + pn + '">',
                html,
                '</ul>'
            ].join('')
            );
        },

        /**
         * 判断组件是否在可视区域内
         *
         * @return {boolean} true 或 false
         */
        isElementInViewport: function () {
            var ele = this.options.$ele;
            var rect = util.rect.getElementRect(ele);

            var winWidth = viewport.getWidth();
            var winHeight = viewport.getHeight();
            var offRect = util.rect.getElementOffset(ele);
            var offLeft = offRect.left;
            var offTop = offRect.top;
            var offWidth = offRect.width;
            var offHeight = offRect.height;

            return (offLeft > -offWidth && offLeft < winWidth && offTop > -offHeight && offTop < winHeight);
        },

        /**
         * 获取当前可视区页码的方法(从0计)
         *
         * @return {integer} 0 或 1
         */
        getShowPage: function () {
            var me = this;

            var scrollPageCacheTopPosition = me.scrollPageCache.topPosition.concat();
            for (var i = scrollPageCacheTopPosition.length - 1; i >= 0; i--) {
                if (me.currentScrollTop >= scrollPageCacheTopPosition[i]) {
                    return i;
                }

            }
            return 0;
        },

        constructor: InfiniteScroll
    };

    return InfiniteScroll;
});
