const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const marked = require('marked');
const frontMatter = require('front-matter');

class MermaidTimelineCompiler {
    constructor() {
        this.postsDir = './post';
        this.outputDir = './dist';
        this.templatePath = './src/template.html';
        this.timelinePath = './config/timeline.md';
        this.taskPath = './config/task.md';
        this.outputFile = 'index.html';
        
        // 确保输出目录存在
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // 确保post目录存在
        if (!fs.existsSync(this.postsDir)) {
            fs.mkdirSync(this.postsDir, { recursive: true });
        }
    }

    // 读取所有post文件
    readPosts() {
        const posts = [];
        
        if (!fs.existsSync(this.postsDir)) {
            return posts;
        }

        const files = fs.readdirSync(this.postsDir);
        
        files.forEach(file => {
            if (file.endsWith('.md')) {
                const filePath = path.join(this.postsDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const parsed = frontMatter(content);
                
                posts.push({
                    filename: file,
                    title: parsed.attributes.title || file.replace('.md', ''),
                    date: parsed.attributes.date || this.getFileDate(filePath),
                    status: parsed.attributes.status || 'pending',
                    priority: parsed.attributes.priority || 'medium',
                    content: parsed.body,
                    html: marked.parse(parsed.body)
                });
            }
        });

        // 按日期排序
        return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // 获取文件修改日期
    getFileDate(filePath) {
        const stats = fs.statSync(filePath);
        return stats.mtime.toISOString().split('T')[0];
    }

    // 读取timeline.md文件中的Mermaid代码
    readTimelineMermaid() {
        if (fs.existsSync(this.timelinePath)) {
            const content = fs.readFileSync(this.timelinePath, 'utf-8');
            // 提取Mermaid代码块
            const mermaidMatch = content.match(/```mermaid\s*([\s\S]*?)\s*```/);
            if (mermaidMatch) {
                return mermaidMatch[1].trim();
            }
            // 如果没有mermaid代码块，返回整个文件内容
            return content.trim();
        }
        // 如果文件不存在，返回默认的甘特图
        return `gantt
    title 任务时间轴
    dateFormat  YYYY-MM-DD
    section 任务
    示例任务 :pending, 2024-01-15, 1d`;
    }

    // 自动统计任务状态（基于post文件夹中的实际文件）
    readTaskStatus() {
        const posts = this.readPosts();
        
        // 统计各状态的任务数量
        const pending = posts.filter(post => post.status === 'pending').length;
        const inProgress = posts.filter(post => post.status === 'in-progress').length;
        const completed = posts.filter(post => post.status === 'completed').length;
        const cancelled = posts.filter(post => post.status === 'cancelled').length;
        
        console.log('自动统计的任务状态:', { pending, inProgress, completed, cancelled, total: posts.length });
        
        return {
            pending,
            inProgress,
            completed,
            cancelled,
            total: posts.length
        };
    }

    // 生成HTML内容
    generateHTML(posts) {
        const template = fs.readFileSync(this.templatePath, 'utf-8');
        
        const mermaidTimeline = this.readTimelineMermaid();
        const taskStatus = this.readTaskStatus();
        
        // 生成任务列表HTML
        const tasksHTML = posts.map(post => `
            <div class="task-card ${post.status}">
                <div class="task-header">
                    <h3>${post.title}</h3>
                    <span class="task-date">${post.date}</span>
                </div>
                <div class="task-status ${post.status}">${this.getStatusText(post.status)}</div>
                <div class="task-priority ${post.priority}">${this.getPriorityText(post.priority)}</div>
                <div class="task-content">${post.html}</div>
            </div>
        `).join('');

        // 替换模板中的占位符
        let html = template
            .replace('{{MERMAID_TIMELINE}}', mermaidTimeline)
            .replace('{{TASK_PENDING_COUNT}}', taskStatus.pending)
            .replace('{{TASK_IN_PROGRESS_COUNT}}', taskStatus.inProgress)
            .replace('{{TASK_COMPLETED_COUNT}}', taskStatus.completed)
            .replace('{{TASK_TOTAL_COUNT}}', taskStatus.total)
            .replace('{{TASKS_HTML}}', tasksHTML)
            .replace('{{POSTS_COUNT}}', posts.length);

        return html;
    }

    // 获取状态文本
    getStatusText(status) {
        const statusMap = {
            'pending': '待处理',
            'in-progress': '进行中',
            'completed': '已完成',
            'cancelled': '已取消'
        };
        return statusMap[status] || status;
    }

    // 获取优先级文本
    getPriorityText(priority) {
        const priorityMap = {
            'low': '低',
            'medium': '中',
            'high': '高',
            'urgent': '紧急'
        };
        return priorityMap[priority] || priority;
    }

    // 编译
    compile() {
        try {
            console.log('开始编译...');
            
            const posts = this.readPosts();
            console.log(`找到 ${posts.length} 个post文件`);
            
            const html = this.generateHTML(posts);
            const outputPath = path.join(this.outputDir, this.outputFile);
            const scripts= fs.readFileSync('./src/scripts/mermaid.min.js', 'utf-8');
            fs.writeFileSync(outputPath, html, 'utf-8');
            const scriptsDir = path.join(this.outputDir, 'scripts');
            if (!fs.existsSync(scriptsDir)) {
                fs.mkdirSync(scriptsDir, { recursive: true });
            }
            fs.writeFileSync(path.join(scriptsDir, 'mermaid.min.js'), scripts, 'utf-8');
            
            console.log(`编译完成！输出文件: ${outputPath}`);
            
        } catch (error) {
            console.error('编译错误:', error);
        }
    }

    // 监听文件变化
    watch() {
        console.log('开始监听文件变化...');
        
        const watcher = chokidar.watch([this.postsDir, this.timelinePath, this.taskPath], {
            ignored: /(^|[\/\\])\../,
            persistent: true
        });

        watcher
            .on('add', path => {
                console.log(`文件添加: ${path}`);
                this.compile();
            })
            .on('change', path => {
                console.log(`文件修改: ${path}`);
                this.compile();
            })
            .on('unlink', path => {
                console.log(`文件删除: ${path}`);
                this.compile();
            });

        console.log('文件监听已启动，按 Ctrl+C 停止');
    }
}

// 主程序
const compiler = new MermaidTimelineCompiler();

if (process.argv.includes('--watch')) {
    compiler.watch();
} else {
    compiler.compile();
}
