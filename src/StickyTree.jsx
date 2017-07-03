import React from 'react';
import PropTypes from 'prop-types';

export default class StickyTree extends React.PureComponent {

    static propTypes = {
        getChildren: PropTypes.func.isRequired,
        getHeight: PropTypes.func.isRequired,
        rowRenderer: PropTypes.func.isRequired,
        root: PropTypes.any.isRequired,
        height: PropTypes.number,
        width: PropTypes.number
    };

    static defaultProps = {
        overscanRowCount: 0,
        renderRoot: true
    };

    constructor(props) {
        super(props);
        this.onScroll = this.onScroll.bind(this);

        this.state = {
            scrollTop: 0,
            currNodePos: 0
        };

        this.nodePosCache = [];
    }

    /**
     *  Converts the consumer's tree structure into a flat array with root at index: 0,
     *  including information about the top and height of each node.
     *
     *  i.e:
     *  <pre>
     *  [
     *    { node: 'root', top: 0, index: 0, height: 100 },
     *    { node: 'child1', top: 10, index: 0, parentIndex: 0 height: 10 },
     *    ...
     *  ]
     *  </pre>
     *
     */
    flattenTree(node, nodes = [], context = { totalHeight: 0, parentIndex: undefined }) {
        const index = nodes.length;
        const nodeInfo = { node, top: context.totalHeight, parentIndex: context.parentIndex, index };
        nodes.push(nodeInfo);

        if (context.parentIndex !== undefined) {
            nodes[context.parentIndex].children.push(index);
        }

        context.totalHeight += this.props.getHeight(node);

        const children = this.props.getChildren(node);
        if (Array.isArray(children)) {
            nodeInfo.children = [];

            for (let i = 0; i < children.length; i++) {
                // Need to reset parentIndex here as we are recursive.
                context.parentIndex = index;
                const child = children[i];
                this.flattenTree(child, nodes, context);
            }
        }
        nodeInfo.height = context.totalHeight - nodeInfo.top;

        return nodes;
    }

    componentWillMount() {
        if (this.props.root) {
            this.nodePosCache = this.flattenTree(this.props.root);
        }
    }

    componentWillReceiveProps(newProps) {
        if (newProps.root !== this.props.root) {
            this.nodePosCache = this.flattenTree(newProps.root);
        }
    }

    getChildContainerStyle(child, top) {
        return { position: 'absolute', top: top, height: child.height, width: '100%' };
    }

    renderParentTree() {
        const rowRenderRange = this.getRenderRowRange();
        const path = this.getParentPath(rowRenderRange.start);

        // Parent nodes to the current range.
        const indexesToRender = new Set();
        for (let i = 0; i < path.length; i++) {
            indexesToRender.add(path[i].index);
        }

        // The rest of the nodes within the range.
        for (let i = rowRenderRange.start; i <= rowRenderRange.end; i++) {
            indexesToRender.add(this.nodePosCache[i].index);
        }

        if (this.props.renderRoot) {
            return (
                <ul className="sticky-tree-list">
                    {this.renderChildWithChildren(path[0], 0, indexesToRender)}
                </ul>
            );
        }
        return this.renderParentContainer(path[0], 'sticky-tree-list', indexesToRender);
    }

    renderParentContainer(parent, className, indexesToRender) {
        return (
            <ul key={parent.node} className={className} style={{ position: 'absolute', width: '100%' }}>
                {this.renderChildren(parent, indexesToRender)}
            </ul>
        );
    }

    renderChildWithChildren(child, top, indexesToRender) {
        return (
            <li key={child.node} style={this.getChildContainerStyle(child, top)}>
                {this.props.rowRenderer(child.node)}
                {this.renderParentContainer(child, 'parent-node', indexesToRender)}
            </li>
        );
    }

    renderChildren(parent, indexesToRender) {
        const nodes = [];
        let top = 0;
        parent.children.forEach(index => {
            const child = this.nodePosCache[index];

            if (indexesToRender.has(index)) {
                if (child.children) {
                    nodes.push(this.renderChildWithChildren(child, top, indexesToRender));
                } else {
                    nodes.push(<li key={child.node} style={this.getChildContainerStyle(child, top)}>{this.props.rowRenderer(child.node)}</li>);
                }
            }
            // Needs to be on the outside so that we add the the top even if
            // this node is not visible
            top += child.height;
        });
        return nodes;
    }

    /**
     * Determines the start and end number of the range to be rendered.
     * @returns {{start: number, end: number}} Indexes within nodePosCache
     */
    getRenderRowRange() {
        let start = this.state.currNodePos - this.props.overscanRowCount;
        if (start < 0) {
            start = 0;
        }
        let end = this.state.currNodePos + 1;

        while (this.nodePosCache[end] && this.nodePosCache[end].top < this.state.scrollTop + this.props.height) {
            end++;
        }

        end = end + this.props.overscanRowCount;
        if (end > this.nodePosCache.length - 1) {
            end = this.nodePosCache.length - 1;
        }

        return { start, end };
    }

    /**
     * Returns the parent path for the specified index within nodePosCache.
     * @param nodeIndex
     * @returns {Array<Node>}
     */
    getParentPath(nodeIndex) {
        let currNode = this.nodePosCache[nodeIndex];
        const path = [currNode];
        while (currNode) {
            currNode = this.nodePosCache[currNode.parentIndex];
            if (currNode) {
                path.push(currNode);
            }
        }
        return path.reverse();
    }

    forwardSearch(scrollTop) {
        const nodePosCache = this.nodePosCache;
        for (let i = this.state.currNodePos; i < nodePosCache.length; i++) {
            if (nodePosCache[i].top >= scrollTop) {
                return i;
            }
        }
        return nodePosCache.length - 1;
    }

    backwardSearch(scrollTop) {
        const nodePosCache = this.nodePosCache;
        for (let i = this.state.currNodePos; i >= 0; i--) {
            if (nodePosCache[i].top <= scrollTop) {
                return i;
            }
        }
        return 0;
    }

    /**
     * Returns the closest node within nodePosCache.
     * @param scrollTop
     */
    findClosestNode(scrollTop) {
        let pos;
        if (scrollTop > this.state.scrollTop) {
            pos = this.forwardSearch(scrollTop);
        } else if (scrollTop < this.state.scrollTop) {
            pos = this.backwardSearch(scrollTop);
        }
        if (pos !== this.state.currNodePos) {
            this.setState({ currNodePos: pos });
        }
    }

    onScroll(e) {
        const scrollTop = e.target.scrollTop;
        this.findClosestNode(scrollTop);
        this.setState({ scrollTop: scrollTop });
    }

    getStyle() {
        let style = {};
        if (this.props.width) {
            style.width = this.props.width;
        }
        if (this.props.height) {
            style.height = this.props.height;
        }
        return style;
    }

    render() {
        return (
            <div className="sticky-tree" style={this.getStyle()} onScroll={this.onScroll}>
                {this.renderParentTree()}
            </div>
        );
    }
}
