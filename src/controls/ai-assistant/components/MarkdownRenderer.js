import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

const CodeBlock = ({ language, children, ...props }) => {
    const [copied, setCopied] = useState(false);
    const codeString = String(children).replace(/\n$/, '');

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(codeString);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div style={{ position: 'relative', marginBottom: '16px' }}>
            {/* Header bar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#2d2d2d',
                padding: '8px 12px',
                borderRadius: '8px 8px 0 0',
                borderBottom: '1px solid #444'
            }}>
                <span style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase' }}>
                    {language || 'code'}
                </span>
                <button
                    onClick={handleCopy}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: copied ? '#22c55e' : '#999',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        transition: 'all 0.2s'
                    }}
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>

            {/* Code block */}
            <SyntaxHighlighter
                style={oneDark}
                language={language}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    borderRadius: '0 0 8px 8px',
                    fontSize: '13px'
                }}
                {...props}
            >
                {codeString}
            </SyntaxHighlighter>
        </div>
    );
};

export default function MarkdownRenderer({ content }) {
    return (
        <div className="markdown-content" style={{ lineHeight: '1.7' }}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                    code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                            <CodeBlock language={match[1]} {...props}>
                                {children}
                            </CodeBlock>
                        ) : (
                            <code
                                style={{
                                    backgroundColor: '#f5f5f5',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    color: '#db0011'
                                }}
                                {...props}
                            >
                                {children}
                            </code>
                        );
                    },
                    table({ children }) {
                        return (
                            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                                <table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '14px'
                                }}>
                                    {children}
                                </table>
                            </div>
                        );
                    },
                    th({ children }) {
                        return (
                            <th style={{
                                backgroundColor: '#f5f5f5',
                                padding: '10px 12px',
                                textAlign: 'left',
                                borderBottom: '2px solid #ddd',
                                fontWeight: '600'
                            }}>
                                {children}
                            </th>
                        );
                    },
                    td({ children }) {
                        return (
                            <td style={{
                                padding: '10px 12px',
                                borderBottom: '1px solid #eee'
                            }}>
                                {children}
                            </td>
                        );
                    },
                    blockquote({ children }) {
                        return (
                            <blockquote style={{
                                borderLeft: '4px solid #db0011',
                                paddingLeft: '16px',
                                margin: '16px 0',
                                color: '#666',
                                fontStyle: 'italic'
                            }}>
                                {children}
                            </blockquote>
                        );
                    },
                    h1({ children }) {
                        return <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '20px 0 12px', color: '#333' }}>{children}</h1>;
                    },
                    h2({ children }) {
                        return <h2 style={{ fontSize: '20px', fontWeight: '600', margin: '18px 0 10px', color: '#333' }}>{children}</h2>;
                    },
                    h3({ children }) {
                        return <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '16px 0 8px', color: '#333' }}>{children}</h3>;
                    },
                    ul({ children }) {
                        return <ul style={{ paddingLeft: '24px', margin: '12px 0' }}>{children}</ul>;
                    },
                    ol({ children }) {
                        return <ol style={{ paddingLeft: '24px', margin: '12px 0' }}>{children}</ol>;
                    },
                    li({ children }) {
                        return <li style={{ marginBottom: '6px' }}>{children}</li>;
                    },
                    p({ children }) {
                        return <p style={{ margin: '12px 0' }}>{children}</p>;
                    },
                    a({ children, href }) {
                        return (
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#db0011', textDecoration: 'underline' }}
                            >
                                {children}
                            </a>
                        );
                    }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
