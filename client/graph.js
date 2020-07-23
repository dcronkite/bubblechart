// define graphcreator object
let BubbleChart = function (svg, nodes, edges, allowZoom=false) {
    let graph = this;
    graph.idct = 0;

    graph.nodes = nodes || [];
    graph.edges = edges || [];
    graph.onBubbleMoveListeners = [];
    graph.onBubbleMovingListeners = [];
    graph.onRelationshipCreatedListeners = [];

    graph.state = {
        previousEnterNode: null,  // previous outer circle that was entered
        selectedNode: null,
        selectedEdge: null,
        mouseDownNode: null,
        mouseEnterNode: null,
        mouseDownLink: null,
        justDragged: false,
        justScaleTransGraph: false,
        lastKeyDown: -1,
        shiftNodeDrag: false,
        selectedText: null
    };

    // define arrow markers for graph links
    let defs = svg.append('svg:defs');
    defs.append('svg:marker')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', "32")
        .attr('markerWidth', 3.5)
        .attr('markerHeight', 3.5)
        .attr('orient', 'auto')
        .append('svg:path')
        .attr('d', 'M0,-5L10,0L0,5');

    // define arrow markers for leading arrow
    defs.append('svg:marker')
        .attr('id', 'mark-end-arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 7)
        .attr('markerWidth', 3.5)
        .attr('markerHeight', 3.5)
        .attr('orient', 'auto')
        .append('svg:path')
        .attr('d', 'M0,-5L10,0L0,5');

    graph.svg = svg;
    graph.svgG = svg.append("g")
        .classed(graph.consts.graphClass, true);
    let svgG = graph.svgG;

    // displayed when dragging between nodes
    graph.dragLine = svgG.append('svg:path')
        .attr('class', 'link dragline hidden')
        .attr('d', 'M0,0L0,0')
        .style('marker-end', 'url(#mark-end-arrow)');

    // svg nodes and edges
    graph.paths = svgG.append("g").selectAll("g");
    graph.circles = svgG.append("g").selectAll("g");
    graph.outerCircles = svgG.append("g").selectAll("g");

    graph.drag = d3.drag()
        .subject(function (d) {
            return {x: d.x, y: d.y};
        })
        .on("start", function (d) {
        })
        .on("drag", function (d) {
            graph.state.justDragged = true;
            graph.dragmove.call(graph, d);
        })
        .on("end", function (d) {
            // todo check if edge-mode is selected
            let mouse = d3.mouse(this);
            let elem = document.elementFromPoint(mouse[0], mouse[1]);
            if (graph.state.shiftNodeDrag) {
                graph.dragEnd.call(graph, d3.select(this), graph.state.mouseEnterNode)
            }
            graph.onBubbleMoveListeners.forEach((func) => {
                func(d);
            });

        });

    // listen for key events
    d3.select(window).on("keydown", function () {
        graph.svgKeyDown.call(graph);
    })
        .on("keyup", function () {
            graph.svgKeyUp.call(graph);
        });
    svg.on("mousedown", function (d) {
        graph.svgMouseDown.call(graph, d);
        if (d3.event.shiftKey) {
            d3.event.stopImmediatePropagation();
        }
    });
    svg.on("mouseup", function (d) {
        graph.svgMouseUp.call(graph, d);
    });

    // listen for dragging
    let dragSvg = d3.zoom()
        .on("zoom", function () {
            if (d3.event.sourceEvent.shiftKey) {
                // TODO  the internal d3 state is still changing
                return false;
            } else {
                graph.zoomed.call(graph);
            }
            return true;
        })
        .on("start", function () {
            var ael = d3.select("#" + graph.consts.activeEditId).node();
            if (ael) {
                ael.blur();
            }
            if (!d3.event.sourceEvent.shiftKey) d3.select('body').style("cursor", "move");
        })
        .on("end", function () {
            d3.select('body').style("cursor", "auto");
        });

    if (allowZoom) {
       svg.call(dragSvg).on("dblclick.zoom", null);
    }

    // listen for resize
    window.onresize = function () {
        graph.updateWindow(svg);
    };
};

BubbleChart.prototype.setIdCt = function (idct) {
    this.idct = idct;
};

BubbleChart.prototype.consts = {
    selectedClass: "selected",
    connectClass: "connect-node",
    circleGClass: "conceptG",
    graphClass: "graph",
    activeEditId: "active-editing",
    BACKSPACE_KEY: 8,
    DELETE_KEY: 46,
    ENTER_KEY: 13,
    nodeRadius: 50
};

/* PROTOTYPE FUNCTIONS */

BubbleChart.prototype.dragmove = function (d) {
    let graph = this;
    let mouseX = d3.mouse(graph.svgG.node())[0];
    let mouseY = d3.mouse(graph.svgG.node())[1];
    if (graph.state.shiftNodeDrag) {
        graph.dragLine.attr('d', 'M' + d.x + ',' + d.y + 'L' + mouseX + ',' + mouseY);
    } else {
        d.x += d3.event.dx;
        d.y += d3.event.dy;
        graph.updateGraph();
        graph.onBubbleMovingListeners.forEach((func) => {
            func(d);
        });
    }
};

/* select all text in element: taken from http://stackoverflow.com/questions/6139107/programatically-select-text-in-a-contenteditable-html-element */
BubbleChart.prototype.selectElementContents = function (el) {
    let range = document.createRange();
    range.selectNodeContents(el);
    let sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
};


/* insert svg line breaks: taken from http://stackoverflow.com/questions/13241475/how-do-i-include-newlines-in-labels-in-d3-charts */
BubbleChart.prototype.insertTitleLinebreaks = function (gEl, title) {
    let words = title.split(/\s+/g),
        nwords = words.length;
    let el = gEl.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-" + (nwords - 1) * 7.5);

    for (let i = 0; i < words.length; i++) {
        let tspan = el.append('tspan').text(words[i]);
        if (i > 0)
            tspan.attr('x', 0).attr('dy', '15');
    }
};


// remove edges associated with a node
BubbleChart.prototype.spliceLinksForNode = function (node) {
    let graph = this,
        toSplice = graph.edges.filter(function (l) {
            return (l.source === node || l.target === node);
        });
    toSplice.map(function (l) {
        graph.edges.splice(graph.edges.indexOf(l), 1);
    });
};

BubbleChart.prototype.replaceSelectEdge = function (d3Path, edgeData) {
    let graph = this;
    d3Path.classed(graph.consts.selectedClass, true);
    if (graph.state.selectedEdge) {
        graph.removeSelectFromEdge();
    }
    graph.state.selectedEdge = edgeData;
};

BubbleChart.prototype.replaceSelectNode = function (d3Node, nodeData) {
    let graph = this;
    d3Node.classed(this.consts.selectedClass, true);
    if (graph.state.selectedNode) {
        graph.removeSelectFromNode();
    }
    graph.state.selectedNode = nodeData;
};

BubbleChart.prototype.removeSelectFromNode = function () {
    let graph = this;
    graph.circles.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    }).classed(graph.consts.selectedClass, false);
    graph.state.selectedNode = null;
};

BubbleChart.prototype.removeSelectFromEdge = function () {
    let graph = this;
    graph.paths.filter(function (cd) {
        return cd === graph.state.selectedEdge;
    }).classed(graph.consts.selectedClass, false);
    graph.state.selectedEdge = null;
};

BubbleChart.prototype.pathMouseDown = function (d3path, d) {
    let graph = this,
        state = graph.state;
    d3.event.stopPropagation();
    state.mouseDownLink = d;

    if (state.selectedNode) {
        graph.removeSelectFromNode();
    }

    let prevEdge = state.selectedEdge;
    if (!prevEdge || prevEdge !== d) {
        graph.replaceSelectEdge(d3path, d);
    } else {
        graph.removeSelectFromEdge();
    }
};

BubbleChart.prototype.outerCircleMouseDown = function (d3node, d) {
    let graph = this,
        state = graph.state;
    state.mouseDownNode = d;
    state.shiftNodeDrag = true;
    // reposition dragged directed edge
    graph.dragLine.classed('hidden', false)
        .attr('d', 'M' + d.x + ',' + d.y + 'L' + d.x + ',' + d.y);
}

// mousedown on node
BubbleChart.prototype.circleMouseDown = function (d3node, d) {
    let graph = this,
        state = graph.state;
};

/* place editable text on node in place of svg text */
BubbleChart.prototype.changeTextOfNode = function (d3node, d) {
    let graph = this,
        consts = graph.consts,
        htmlEl = d3node.node();
    d3node.selectAll("text").remove();
    let nodeBCR = htmlEl.getBoundingClientRect(),
        curScale = nodeBCR.width / consts.nodeRadius,
        placePad = 5 * curScale,
        useHW = curScale > 1 ? nodeBCR.width * 0.71 : consts.nodeRadius * 1.42;
    // replace with editableconent text
    let d3txt = graph.svg.selectAll("foreignObject")
        .data([d])
        .enter()
        .append("foreignObject")
        .attr("x", nodeBCR.left + placePad)
        .attr("y", nodeBCR.top + placePad)
        .attr("height", 2 * useHW)
        .attr("width", useHW)
        .append("xhtml:p")
        .attr("id", consts.activeEditId)
        .attr("contentEditable", "true")
        .text(d.title)
        .on("mousedown", function (d) {
            d3.event.stopPropagation();
        })
        .on("keydown", function (d) {
            d3.event.stopPropagation();
            if (d3.event.keyCode === consts.ENTER_KEY && !d3.event.shiftKey) {
                this.blur();
            }
        })
        .on("blur", function (d) {
            d.title = this.textContent;
            graph.insertTitleLinebreaks(d3node, d.title);
            d3.select(this.parentElement).remove();
        });
    return d3txt;
};

BubbleChart.prototype.dragEnd = function (d3node, d) {
    let graph = this,
        state = graph.state,
        consts = graph.consts;
    // reset the states
    state.shiftNodeDrag = false;
    d3node.classed(consts.connectClass, false);

    let mouseDownNode = state.mouseDownNode;
    let mouseEnterNode = state.mouseEnterNode;

    if (state.justDragged) {
        // dragged, not clicked
        state.justDragged = false;
    }

    graph.dragLine.classed("hidden", true);

    if (!mouseDownNode || !mouseEnterNode) return;


    if (mouseDownNode !== d) {
        // we're in a different node: create new edge for mousedown edge and add to graph
        let newSource = mouseDownNode.id;
        let newTarget = d.id;
        let filtRes = graph.paths.filter(function (d) {
            if (d.source === newTarget && d.target === newSource) {
                graph.edges.splice(graph.edges.indexOf(d), 1);
            }
            return d.source === newSource && d.target === newTarget;
        });
        if (!filtRes || !filtRes[0] || !filtRes[0].length) {
            graph.createEdge(newSource, newTarget);
            graph.updateGraph();
        }
    }
    state.mouseDownNode = null;
    state.mouseEnterNode = null;
};

// mouseup on nodes
BubbleChart.prototype.circleMouseUp = function (d3node, d) {
    let graph = this,
        state = graph.state,
        consts = graph.consts;
    // reset the states
    state.shiftNodeDrag = false;
    d3node.classed(consts.connectClass, false);

    if (d3.event.shiftKey) {
        // shift-clicked node: edit text content
        let d3txt = graph.changeTextOfNode(d3node, d);
        let txtNode = d3txt.node();
        graph.selectElementContents(txtNode);
        txtNode.focus();
    } else {
        if (state.selectedEdge) {
            graph.removeSelectFromEdge();
        }
    }

    let prevNode = state.selectedNode;
    if (!prevNode || prevNode.id !== d.id) {
        graph.replaceSelectNode(d3node, d);
    } else {
        graph.removeSelectFromNode();
    }

}; // end of circles mouseup

// mouseup on nodes
BubbleChart.prototype.outerCircleMouseUp = function (d3node, d) {
    let graph = this,
        state = graph.state,
        consts = graph.consts;
    // reset the states
    state.shiftNodeDrag = true;
    d3node.classed(consts.connectClass, false);
}; // end of circles mouseup

// mousedown on main svg
BubbleChart.prototype.svgMouseDown = function () {
    this.state.graphMouseDown = true;
};

// mouseup on main svg
BubbleChart.prototype.svgMouseUp = function () {
    let graph = this,
        state = graph.state;
    if (state.justScaleTransGraph) {
        // dragged not clicked
        state.justScaleTransGraph = false;
    } else if (state.graphMouseDown && d3.event.shiftKey) {
        // clicked not dragged from svg
        let xycoords = d3.mouse(graph.svgG.node()),
            d = {id: graph.idct++, title: "new concept", x: xycoords[0], y: xycoords[1]};
        graph.nodes.push(d);
        graph.updateGraph();
        // make title of text immediently editable
        let d3txt = graph.changeTextOfNode(graph.circles.filter(function (dval) {
                return dval.id === d.id;
            }), d),
            txtNode = d3txt.node();
        graph.selectElementContents(txtNode);
        txtNode.focus();
    } else if (state.shiftNodeDrag) {
        // dragged from node
        state.shiftNodeDrag = false;
        graph.dragLine.classed("hidden", true);
    }
    state.graphMouseDown = false;
};

// keydown on main svg
BubbleChart.prototype.svgKeyDown = function () {
    let graph = this,
        state = graph.state,
        consts = graph.consts;
    // make sure repeated key presses don't register for each keydown
    if (state.lastKeyDown !== -1) return;

    state.lastKeyDown = d3.event.keyCode;
    let selectedNode = state.selectedNode,
        selectedEdge = state.selectedEdge;

    switch (d3.event.keyCode) {
        case consts.BACKSPACE_KEY:
        case consts.DELETE_KEY:
            d3.event.preventDefault();
            if (selectedNode) {
                graph.nodes.splice(graph.nodes.indexOf(selectedNode), 1);
                graph.spliceLinksForNode(selectedNode);
                state.selectedNode = null;
                graph.updateGraph();
            } else if (selectedEdge) {
                graph.edges.splice(graph.edges.indexOf(selectedEdge), 1);
                state.selectedEdge = null;
                graph.updateGraph();
            }
            break;
    }
};

BubbleChart.prototype.svgKeyUp = function () {
    this.state.lastKeyDown = -1;
};

// call to propagate changes to graph
BubbleChart.prototype.updateGraph = function () {

    let graph = this,
        consts = graph.consts,
        state = graph.state;

    graph.paths = graph.paths.data(graph.edges, function (d) {
        return String(d.source) + "+" + String(d.target);
    });
    let paths = graph.paths;
    // update existing paths
    paths.style('marker-end', 'url(#end-arrow)')
        .classed(consts.selectedClass, function (d) {
            return d === state.selectedEdge;
        })
        .attr("d", function (d) {
            let source = graph.getBubbleById(d.source);
            let target = graph.getBubbleById(d.target);
            return "M" + source.x + "," + source.y + "L" + target.x + "," + target.y;
        });

    // remove old links
    paths.exit().remove();

    // add new paths
    paths = paths.enter()
        .append("path")
        .style('marker-end', 'url(#end-arrow)')
        .classed("link", true)
        .attr("d", function (d) {
            let source = graph.getBubbleById(d.source);
            let target = graph.getBubbleById(d.target);
            console.log(d);
            console.log(source, target);
            console.log(target.x);
            console.log(source.x);
            return "M" + source.x + "," + source.y + "L" + target.x + "," + target.y;
        })
        .merge(paths)
        .on("mouseup", function (d) {
            // state.mouseDownLink = null;
        })
        .on("mousedown", function (d) {
                graph.pathMouseDown.call(graph, d3.select(this), d);
            }
        );

    graph.paths = paths;

    // update existing nodes
    graph.outerCircles = graph.outerCircles.data(graph.nodes, function (d) {
        return d.id;
    });
    graph.circles = graph.circles.data(graph.nodes, function (d) {
        return d.id;
    });

    // remove old nodes
    graph.outerCircles.exit().remove();
    graph.circles.exit().remove();

    graph.outerCircles.attr("transform", function (d) {
        return "translate(" + d.x + "," + d.y + ")";
    });

    graph.circles.attr("transform", function (d) {
        return "translate(" + d.x + "," + d.y + ")";
    });

    // add new nodes
    let newOGs = graph.circles.enter()
        .append("g").merge(graph.outerCircles);
    newOGs.classed(consts.circleGClass, true)
        .attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        })
        .on("mouseover", function (d) {
            state.mouseEnterNode = d;
            if (state.shiftNodeDrag) {
                d3.select(this).classed(consts.connectClass, true);
            }
        })
        .on("mouseout", function (d) {
            state.previousEnterNode = state.mouseEnterNode;
            state.mouseEnterNode = null;
            d3.select(this).classed(consts.connectClass, false);
        })
        .on("mousedown", function (d) {
            graph.outerCircleMouseDown.call(graph, d3.select(this), d);
        })
        .call(graph.drag)
        .on("click", function (d) {
            graph.outerCircleMouseUp.call(graph, d3.select(this), d);
        })
    ;
    graph.outerCircles = newOGs;
    newOGs.each(function (d) {
        if (this.childNodes.length === 0) {
            d3.select(this)
                .append("circle")
                .attr("r", function (d) {
                    return d.radius + 20;
                });
        }
    });

    let newGs = graph.circles.enter()
        .append("g").merge(graph.circles);

    newGs.classed(consts.circleGClass, true)
        .attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        })
        .on("mouseover", function (d) {
            if (state.shiftNodeDrag) {
                // continue drag over the inner circle
                state.mouseEnterNode = state.previousEnterNode;
            }
        })
        .on("mousedown", function (d) {
            graph.circleMouseDown.call(graph, d3.select(this), d);
        })
        .call(graph.drag)
        .on("click", function (d) {
            graph.circleMouseUp.call(graph, d3.select(this), d);
        });

    graph.circles = newGs;

    newGs.each(function (d) {
        if (this.childNodes.length === 0) {
            d3.select(this)
                .append("circle")
                .attr("r", function (d) {
                    return d.radius;
                });
            graph.insertTitleLinebreaks(d3.select(this), d.title);
        }
    });

};

BubbleChart.prototype.zoomed = function () {
    this.state.justScaleTransGraph = true;
    d3.select("." + this.consts.graphClass)
        .attr("transform", d3.event.transform);
};

BubbleChart.prototype.updateWindow = function (svg) {
    let docEl = document.documentElement,
        bodyEl = document.getElementsByTagName('body')[0];
    let x = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth;
    let y = window.innerHeight || docEl.clientHeight || bodyEl.clientHeight;
    svg.attr("width", x).attr("height", y);
};

BubbleChart.prototype.addNode = function (node) {
    this.nodes.push(node);
}

BubbleChart.prototype.createEdge = function (source, target) {
    this.onRelationshipCreatedListeners.forEach((listener) => {
        console.log(source, target);
        listener(source, target);
    })
}

BubbleChart.prototype.addEdge = function (edge) {
    this.edges.push(edge);
}

BubbleChart.prototype.addOnBubbleMovedListener = function (listener) {
    this.onBubbleMoveListeners.push(listener);
}
BubbleChart.prototype.addOnRelationshipCreatedListener = function (listener) {
    this.onRelationshipCreatedListeners.push(listener);
}
BubbleChart.prototype.addOnBubbleMovingListener = function (listener) {
    this.onBubbleMovingListeners.push(listener);
}


BubbleChart.prototype.getBubbleById = function (id) {
    for (let i = 0; i < this.nodes.length; i++) {
        if (this.nodes[i].id === id) {
            return this.nodes[i];
        }
    }
}


BubbleChart.prototype.moveBubble = function (id, x, y) {
    let bubble = this.getBubbleById(id);
    bubble.x = x;
    bubble.y = y;
    this.updateGraph();
}

/**** MAIN ****/

// warn the user when leaving
window.onbeforeunload = function () {
    return "Make sure to save your graph locally before leaving :-)";
};