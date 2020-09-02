// define graphcreator object
let BubbleChart = function (svg, nodes, edges, allowZoom = false) {
    let graph = this;
    graph.idct = 0;

    graph.nodes = nodes || [];
    graph.edges = edges || [];
    graph.onBubbleMoveListeners = [];
    graph.onBubbleMovingListeners = [];
    graph.onRelationshipCreatedListeners = [];
    graph.onBubbleSizeChangeListener = [];
    graph.onBubbleSelectedListener = [];

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
    graph.pathTrash = svgG.append("g").selectAll("g");
    graph.circles = svgG.append("g").selectAll("g");
    graph.outerCircles = svgG.append("g").selectAll("g");
    graph.plusButtons = svgG.append("g").selectAll("g");
    graph.minusButtons = svgG.append("g").selectAll("g");
    graph.trashButtons = svgG.append("g").selectAll("g");

    graph.drag = d3.drag()
        .subject(function (d) {
            return {x: d.x, y: d.y};
        })
        .on("start", function (d) {
            if (graph.state.shiftNodeDrag) {  // dragging edge/relationship
                // ignore all inner circles
                graph.circles.style('pointer-events', 'none');
            }
        })
        .on("drag", function (d) {
            graph.state.justDragged = true;
            graph.dragmove.call(graph, d);
        })
        .on("end", function (d) {
            // todo check if edge-mode is selected
            let mouse = d3.mouse(this);
            let elem = document.elementFromPoint(mouse[0], mouse[1]);
            if (graph.state.shiftNodeDrag) {  // dragging edge/relationship
                graph.dragEnd.call(graph, d3.select(this), graph.state.mouseEnterNode)
                graph.circles.style('pointer-events', 'auto');
            } else {  // dragging node/bubble
                graph.circleMouseUp.call(graph, d3.select(this), d);
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
        graph.updateWindow();
    };
    d3.select(window).on('resize.updatesvg', graph.updateWindow);
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
    gEl.select("text").remove();
    let el = gEl.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-" + (nwords - 1) * 7.5);

    for (let i = 0; i < words.length; i++) {
        let tspan = el.append('tspan').text(words[i]);
        if (i > 0)
            tspan.attr('x', 0).attr('dy', '15');
    }
};


BubbleChart.prototype.addIcon = function (gEl, iconUnicode) {
    // for fontawesome cheatsheet: https://fontawesome.com/cheatsheet?from=io
    gEl.select('text').remove();
    let el = gEl.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('class', 'fa')
        .attr('font-size', '20px')
        .attr('fill', '#FFFFFF')
        .text(function () {
            return iconUnicode;
        });
}


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
    graph.pathTrash.filter(function (cd) {
        console.log(cd, edgeData);
        return cd === edgeData;
    }).style("visibility", "visible");
    if (graph.state.selectedEdge) {
        graph.removeSelectFromEdge();
    }
    graph.state.selectedEdge = edgeData;
};

BubbleChart.prototype.replaceSelectNode = function (d3Node, nodeData) {
    let graph = this;
    d3Node.classed(this.consts.selectedClass, true);
    graph.insertTitleLinebreaks(d3Node, nodeData.title);
    if (graph.state.selectedNode) {
        graph.removeSelectFromNode();
    }
    graph.state.selectedNode = nodeData;
    graph.outerCircles.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    }).each(function (d, i) {
        d3.select(this).select('circle').attr("r", getSizeForNode(d) + 20);
    });
    graph.plusButtons.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    }).style("visibility", "visible");
    graph.minusButtons.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    }).style("visibility", "visible");
    graph.trashButtons.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    }).style("visibility", "visible");
};

BubbleChart.prototype.removeSelectFromNode = function () {
    let graph = this;
    graph.circles.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    })
        .classed(graph.consts.selectedClass, false)
        .each(function (d, i) {
            graph.insertTitleLinebreaks(d3.select(this), d.label);
        })
    ;
    graph.outerCircles.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    })
        .each(function (d, i) {
            d3.select(this).select('circle').attr("r", getSizeForNode(d) + 5);
        })
    ;
    graph.plusButtons.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    }).style("visibility", "hidden");
    graph.minusButtons.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    }).style("visibility", "hidden");
    graph.trashButtons.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    }).style("visibility", "hidden");
    graph.state.selectedNode = null;
};

BubbleChart.prototype.removeSelectFromEdge = function () {
    let graph = this;
    graph.paths.filter(function (cd) {
        return cd === graph.state.selectedEdge;
    }).classed(graph.consts.selectedClass, false);
    graph.pathTrash.filter(function (cd) {
        console.log('remove select', cd, graph.state.selectedEdge);
        return cd === graph.state.selectedEdge;
    }).style("visibility", "hidden");
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

BubbleChart.prototype.increaseBubbleSize = function (d3node, d) {
    let graph = this,
        state = graph.state;
    if (d.size === 'S') {
        d.size = 'M';
    } else if (d.size === 'M') {
        d.size = 'L';
    } else {
        return;
    }
    graph.updateBubbleSize(d);
}

BubbleChart.prototype.decreaseBubbleSize = function (d3node, d) {
    let graph = this,
        state = graph.state;
    if (d.size === 'L') {
        d.size = 'M';
    } else if (d.size === 'M') {
        d.size = 'S';
    } else {
        return;
    }
    graph.updateBubbleSize(d);
}

BubbleChart.prototype.updateBubbleSize = function (d) {
    graph.circles.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    })
        .select('circle')
        .attr("r", function (d) {
            return getSizeForNode(d);
        });
    graph.outerCircles.filter(function (cd) {
        return cd.id === graph.state.selectedNode.id;
    })
        .select('circle')
        .attr("r", function (d) {
            return getSizeForNode(d) + 20;
        });
    graph.onBubbleSizeChangeListener.forEach((func) => {
        func(d);
    });
}

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
        .text(d.label)
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
            d.label = this.textContent;
            graph.insertTitleLinebreaks(d3node, d.label);
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
        graph.onBubbleSelectedListener.forEach((func) => {
            func(d, true);
        });
    } else {
        graph.removeSelectFromNode();
        graph.onBubbleSelectedListener.forEach((func) => {
            func(d, false);
        });
    }

}; // end of circles mouseup

BubbleChart.prototype.selectNode = function (id, selectNewNode) {
    let graph = this;

    let d = graph.getBubbleById(id);
    let d3node = graph.circles.filter(function (cd) {
        return cd.id === id;
    });
    if (selectNewNode) {
        graph.replaceSelectNode(d3node, d);
    } else {
        graph.removeSelectFromNode();
    }
}


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
};

BubbleChart.prototype.svgKeyUp = function () {
    this.state.lastKeyDown = -1;
};

function getSizeForNode(d) {
    if (d.size === 'S') {
        return 30;
    } else if (d.size === 'M') {
        return 50;
    } else if (d.size === 'L') {
        return 70;
    } else {
        return 5;
    }
}


function getColorForNode(d) {
    if (d.category === undefined || d.category === null) {
        return '#000000';
    } else if (d.category === 'PV') {
        return '#57A645';
    } else if (d.category === 'SD') {
        return '#D36B12';
    } else if (d.category === 'HR') {
        return '#087DC3';
    } else {
        return '#000000';
    }
}

function getLightColorForNode(d) {
    if (d.category === undefined || d.category === null) {
        return '#000000';
    } else if (d.category === 'PV') {
        return '#BBF2AE';
    } else if (d.category === 'SD') {
        return '#DB9455';
    } else if (d.category === 'HR') {
        return '#459BCC';
    } else {
        return '#FFFFFF';
    }
}

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
            return "M" + source.x + "," + source.y + "L" + target.x + "," + target.y;
        })
        .merge(paths)
        .on("mouseup", function (d) {
            // state.mouseDownLink = null;
        })
        .on("mousedown", function (d) {
            graph.pathMouseDown.call(graph, d3.select(this), d);
        })
    ;
    graph.paths = paths;

    graph.pathTrash = graph.pathTrash.data(graph.edges, function (d) {
        return String(d.source) + "+" + String(d.target);
    });
    graph.pathTrash.exit().remove();
    graph.pathTrash = graph.buildButtons(
        graph.pathTrash,
        d => (graph.getBubbleById(d.source).x + graph.getBubbleById(d.target).x) / 2,
        d => (graph.getBubbleById(d.source).y + graph.getBubbleById(d.target).y) / 2,
        '\uf1f8',
        graph.deleteEdge
    );

    // update existing nodes
    graph.outerCircles = graph.outerCircles.data(graph.nodes, function (d) {
        return d.id;
    });
    graph.circles = graph.circles.data(graph.nodes, function (d) {
        return d.id;
    });
    graph.minusButtons = graph.minusButtons.data(graph.nodes, function (d) {
        return d.id;
    });
    graph.plusButtons = graph.plusButtons.data(graph.nodes, function (d) {
        return d.id;
    });
    graph.trashButtons = graph.trashButtons.data(graph.nodes, function (d) {
        return d.id;
    });

    // remove old nodes
    graph.outerCircles.exit().remove();
    graph.circles.exit().remove();
    graph.minusButtons.exit().remove();
    graph.plusButtons.exit().remove();
    graph.trashButtons.exit().remove();

    graph.outerCircles.attr("transform", function (d) {
        return `translate(${d.x},${d.y})`;
    });

    graph.circles.attr("transform", function (d) {
        return `translate(${d.x},${d.y})`;
    });

    graph.minusButtons.attr("transform", function (d) {
        return `translate(${d.x - 50},${d.y - 50})`;
    });
    graph.plusButtons.attr("transform", function (d) {
        return `translate(${d.x + 50},${d.y - 50})`;
    });
    graph.trashButtons.attr("transform", function (d) {
        return `translate(${d.x},${d.y + 71})`;
    });

    // add new nodes
    let newOGs = graph.circles.enter()
        .append("g").merge(graph.outerCircles);
    newOGs.classed(consts.circleGClass, true)
        .attr("transform", function (d) {
            return `translate(${d.x},${d.y})`;
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
                    return getSizeForNode(d) + 5;
                })
                .style("fill", function (d) {
                    return getLightColorForNode(d);
                })
                .style("stroke", function (d) {
                    return getLightColorForNode(d);
                })
            ;
        }
    });

    let newGs = graph.circles.enter()
        .append("g").merge(graph.circles);

    newGs.classed(consts.circleGClass, true)
        .attr("transform", function (d) {
            return `translate(${d.x},${d.y})`;
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
            // graph.circleMouseUp.call(graph, d3.select(this), d);
        });

    graph.circles = newGs;

    newGs.each(function (d) {
        if (this.childNodes.length === 0) {
            d3.select(this)
                .append("circle")
                .attr("r", function (d) {
                    return getSizeForNode(d);
                })
                .style("fill", function (d) {
                    return getColorForNode(d);
                })
                .style("stroke", function (d) {
                    return getColorForNode(d);
                })
            ;
            graph.insertTitleLinebreaks(d3.select(this), d.label);
        }
    });

    graph.plusButtons = graph.buildButtons(
        graph.plusButtons,
        d => d.x + getSizeForNode(d) + 5,
        d => d.y - getSizeForNode(d) - 5,
        '\uf067',
        graph.increaseBubbleSize
    );
    graph.minusButtons = graph.buildButtons(
        graph.minusButtons,
        d => d.x - getSizeForNode(d) - 5,
        d => d.y - getSizeForNode(d) - 5,
        '\uf068',
        graph.decreaseBubbleSize
    );
    graph.trashButtons = graph.buildButtons(
        graph.trashButtons,
        d => d.x,
        d => d.y + Math.floor((getSizeForNode(d) + 5) * 1.4),
        '\uf1f8',
        graph.deleteNode
    );
};

BubbleChart.prototype.buildButtons = function (graphButtons, xoffset, yoffset, unicodeIcon, func) {
    let buttons = graphButtons.enter()
        .append("g").merge(graphButtons);
    buttons.classed('sizeButton', true)
        .attr("transform", function (d) {
            return `translate(${xoffset(d)},${yoffset(d)})`;
        })
        .on("click", function (d) {
            func.call(graph, d3.select(this), d);
        })
    ;
    buttons.each(function (d) {
        if (this.childNodes.length === 0) {
            d3.select(this)
                .append("circle")
                .attr("r", function (d) {
                    return 20;
                })
                .style("fill", function (d) {
                    return getColorForNode(d);
                })
                .style("stroke", function (d) {
                    return getLightColorForNode(d);
                })
            ;
            graph.addIcon(d3.select(this), unicodeIcon);
        }
    });
    return buttons;
}

BubbleChart.prototype.zoomed = function () {
    this.state.justScaleTransGraph = true;
    d3.select("." + this.consts.graphClass)
        .attr("transform", d3.event.transform);
};

BubbleChart.prototype.updateWindow = function () {
    let docEl = document.documentElement,
        bodyEl = document.getElementsByTagName('body')[0];
    let x = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth;
    let y = window.innerHeight || docEl.clientHeight || bodyEl.clientHeight;
    svg.attr("width", x).attr("height", y);
};

BubbleChart.prototype.addNode = function (node) {
    this.nodes.push(node);
}

BubbleChart.prototype.deleteNode = function (node, d) {
    console.log('delete nod', d);
}

BubbleChart.prototype.deleteEdge = function (node, d) {
    console.log('delete edge', d);
}

BubbleChart.prototype.createEdge = function (source, target) {
    this.onRelationshipCreatedListeners.forEach((listener) => {
        listener(source, target);
    });
    // this.edges.push({'source': source, 'target': target});
}

BubbleChart.prototype.addEdge = function (edge) {
    this.edges.push(edge);
}

BubbleChart.prototype.clearEdges = function () {
    this.edges = [];
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
BubbleChart.prototype.addOnBubbleSizeChangeListener = function (listener) {
    this.onBubbleSizeChangeListener.push(listener);
}
BubbleChart.prototype.addOnBubbleSelectedListener = function (listener) {
    this.onBubbleSelectedListener.push(listener);
}


BubbleChart.prototype.getBubbleById = function (id) {
    for (let i = 0; i < this.nodes.length; i++) {
        if (this.nodes[i].id === id) {
            return this.nodes[i];
        }
    }
}


BubbleChart.prototype.changeBubbleSize = function (id, size) {
    this.getBubbleById(id).size = size;
    graph.circles.filter(function (cd) {
        return cd.id === id;
    })
        .select('circle')
        .attr("r", function (d) {
            return getSizeForNode(d);
        });
    graph.outerCircles.filter(function (cd) {
        return cd.id === id;
    })
        .select('circle')
        .attr("r", function (d) {
            return getSizeForNode(d) + 20;
        });
}


BubbleChart.prototype.moveBubble = function (id, x, y) {
    let bubble = this.getBubbleById(id);
    bubble.x = x;
    bubble.y = y;
    this.updateGraph();
}

BubbleChart.prototype.clear = function () {
    this.nodes = [];
}

BubbleChart.prototype.get = function (kwargs) {
    let chosenBubbles = [];
    for (let i = 0; i < this.nodes.length; i++) {
        if (kwargs['filter'](this.nodes[i])) {
            chosenBubbles.push(this.nodes[i]);
        }
    }
    return chosenBubbles;
}

BubbleChart.prototype.updateOnly = function (bubble) {
    console.error('Update only this bubble not implemented');
    console.log(bubble);
}

/**** MAIN ****/

// warn the user when leaving
window.onbeforeunload = function () {
    return "Make sure to save your graph locally before leaving :-)";
};
