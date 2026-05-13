// 全局共享功能函数

// 页面加载时的初始化检查
function checkLogin() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser && window.location.pathname.includes('student.html' || 'teacher.html')) {
        window.location.href = 'index.html';
    }
    return currentUser;
}

// 显示消息提示
function showMessage(message, type = 'info') {
    // 创建消息元素
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        animation: slideInRight 0.3s ease, fadeOut 0.3s ease 2.7s;
    `;
    
    // 根据类型设置背景色
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    messageEl.style.backgroundColor = colors[type] || colors.info;
    
    messageEl.textContent = message;
    document.body.appendChild(messageEl);
    
    // 3秒后移除
    setTimeout(() => {
        messageEl.remove();
    }, 3000);
}

// 加载动画
function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p style="margin-top: 20px;">加载中...</p>
            </div>
        `;
    }
}

// 隐藏加载动画
function hideLoading(containerId, content) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = content;
    }
}

// 格式化金额
function formatCurrency(amount) {
    return '¥' + parseFloat(amount).toFixed(2);
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// 获取当前学期
function getCurrentTerm() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    if (month >= 9) {
        return `${year}-${year + 1}学年 第一学期`;
    } else if (month >= 2) {
        return `${year - 1}-${year}学年 第二学期`;
    } else {
        return `${year - 1}-${year}学年 第一学期`;
    }
}

// 验证消费记录数据
function validateRecordData(data) {
    const errors = [];
    
    if (!data.amount || data.amount <= 0) {
        errors.push('消费金额必须大于0');
    }
    
    if (!data.location || data.location.trim().length === 0) {
        errors.push('请填写消费地点');
    }
    
    if (!data.date) {
        errors.push('请选择消费日期');
    }
    
    if (new Date(data.date) > new Date()) {
        errors.push('消费日期不能晚于今天');
    }
    
    return errors;
}

// 模拟API调用
async function mockAPICall(endpoint, data = {}, delay = 1000) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // 模拟网络请求
            const success = Math.random() > 0.1; // 90%成功率
            if (success) {
                resolve({
                    success: true,
                    data: { ...data, id: Date.now() },
                    message: '请求成功'
                });
            } else {
                reject({
                    success: false,
                    message: '网络请求失败，请重试'
                });
            }
        }, delay);
    });
}

// 页面切换动画
function pageTransition(outPage, inPage) {
    outPage.style.opacity = '0';
    outPage.style.transform = 'translateX(-20px)';
    
    setTimeout(() => {
        outPage.style.display = 'none';
        inPage.style.display = 'block';
        
        setTimeout(() => {
            inPage.style.opacity = '1';
            inPage.style.transform = 'translateX(0)';
        }, 50);
    }, 300);
}

// 添加键盘快捷键
document.addEventListener('keydown', function(e) {
    // Ctrl + S 保存
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        const saveBtn = document.querySelector('[onclick*="submit"], [onclick*="save"]');
        if (saveBtn) {
            saveBtn.click();
            showMessage('已保存', 'success');
        }
    }
    
    // ESC 关闭弹窗
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal.show');
        if (modals.length > 0) {
            modals[0].classList.remove('show');
        }
    }
});

// 页面加载完成后运行
document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    checkLogin();
    
    // 添加样式动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes fadeOut {
            from {
                opacity: 1;
            }
            to {
                opacity: 0;
            }
        }
        
        * {
            transition: background-color 0.3s, border-color 0.3s;
        }
        
        button, input, select, textarea {
            transition: all 0.3s ease;
        }
        
        button:hover {
            transform: translateY(-2px);
        }
        
        button:active {
            transform: translateY(0);
        }
    `;
    document.head.appendChild(style);
});